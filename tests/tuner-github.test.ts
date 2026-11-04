import { describe, expect, it } from 'vitest';
import { DATA_FILES } from '../src/data/index.ts';
import { formatJson, GitHubSaveError, parseRepo, saveToGitHub } from '../tools/tuner/github.ts';
import type { Change } from '../tools/tuner/proposal.ts';

type Call = { method: string; url: string; body: unknown };

/** GitHub の API の模擬。保存先のブランチの params.json を remoteParams として返す。 */
const fakeGitHub = (remoteParams: unknown, options: { refStatus?: number } = {}) => {
  const calls: Call[] = [];
  const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status });
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    if (method === 'GET' && url.includes('/git/ref/heads/')) return json({ object: { sha: 'head1' } });
    if (method === 'GET' && url.includes('/git/commits/head1')) return json({ tree: { sha: 'tree0' } });
    if (method === 'GET' && url.includes('/contents/src/data/params.json')) {
      const bytes = new TextEncoder().encode(formatJson(remoteParams));
      return json({ encoding: 'base64', content: btoa(String.fromCharCode(...bytes)) });
    }
    if (method === 'POST' && url.endsWith('/git/trees')) return json({ sha: 'tree1' }, 201);
    if (method === 'POST' && url.endsWith('/git/commits')) return json({ sha: 'commit1', html_url: 'https://github.com/o/r/commit/commit1' }, 201);
    if (method === 'PATCH' && url.includes('/git/refs/heads/')) return options.refStatus ? json({ message: 'x' }, options.refStatus) : json({});
    return json({ message: 'not found' }, 404);
  }) as typeof fetch;
  return { calls, fetcher };
};

const params = DATA_FILES['params.json'] as { actions: { workerCost: { normal: number } } };
const change: Change = {
  file: 'params.json',
  path: ['actions', 'workerCost', 'normal'],
  before: params.actions.workerCost.normal,
  after: params.actions.workerCost.normal + 1,
};
const target = { owner: 'o', repo: 'r', branch: 'main' };

describe('チューナーの GitHub への保存（案A、ユーザー決定 2026-11-04）', () => {
  it('保存先の最新の JSON に変更点を適用し、1つの commit にまとめて早送りで ref を更新する', async () => {
    // 指示書 3-5（書き出し）、段階5 の公開ページ
    const { calls, fetcher } = fakeGitHub(params);
    const result = await saveToGitHub({ token: 't', target, changes: [change], message: 'm' }, fetcher);
    expect(result).toEqual({ commitSha: 'commit1', commitUrl: 'https://github.com/o/r/commit/commit1', files: ['params.json'] });
    const tree = calls.find((c) => c.url.endsWith('/git/trees'))?.body as { base_tree: string; tree: { path: string; content: string }[] };
    expect(tree.base_tree).toBe('tree0');
    expect(tree.tree.map((t) => t.path)).toEqual(['src/data/params.json']);
    const written = JSON.parse(tree.tree[0]?.content ?? '{}') as typeof params;
    expect(written.actions.workerCost.normal).toBe(change.after);
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ sha: 'commit1', force: false });
  });

  it('保存先の値が調整案の元の値と食い違えば、上書きせずに止める', async () => {
    // 指示書 3-5（元データとの食い違いは適用しない）
    const changed = structuredClone(params);
    changed.actions.workerCost.normal = 99;
    const { calls, fetcher } = fakeGitHub(changed);
    await expect(saveToGitHub({ token: 't', target, changes: [change], message: 'm' }, fetcher)).rejects.toThrow('変わっている');
    expect(calls.some((c) => c.method === 'POST' || c.method === 'PATCH')).toBe(false);
  });

  it('ref の更新が早送りできない・トークンが無効などの失敗は、直せる言葉で返す', async () => {
    // 指示書 3-5
    const conflict = fakeGitHub(params, { refStatus: 422 });
    await expect(saveToGitHub({ token: 't', target, changes: [change], message: 'm' }, conflict.fetcher)).rejects.toThrow('もう一度保存');
    await expect(saveToGitHub({ token: '', target, changes: [change], message: 'm' }, conflict.fetcher)).rejects.toBeInstanceOf(GitHubSaveError);
    expect(parseRepo('okuson-droid/city-boardgame')).toEqual({ owner: 'okuson-droid', repo: 'city-boardgame' });
    expect(parseRepo('bad')).toBeNull();
  });
});
