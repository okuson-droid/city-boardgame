// チューナーの GitHub への保存（案A、ユーザー決定 2026-11-04）。公開ページのチューナーから、src/data/ の JSON を
// GitHub の API で直接 commit する。commit が main に入ると、pages.yml が画面と Edge Function を配置し直す。
// - トークンは、このリポジトリの Contents の読み書きだけを許した fine-grained personal access token をユーザーが貼る。
//   トークンはそのブラウザ（localStorage）にだけ置き、リポジトリやビルドには含めない。
// - 保存の前に、保存先のブランチの最新の JSON を読み、調整案の変更点（元の値と新しい値）を適用し直す。
//   元の値が食い違う変更点があれば（誰かが先に変えた場合）、上書きせずに止める。
// - 複数のファイルを1つの commit にまとめる（Git Data API：tree → commit → ref の更新）。ref は早送りだけで更新する。
// 画面に依存しない関数だけを置き、単体テストで確かめる。ライブラリは使わない。

import type { DataFiles } from '../../src/data/index.ts';
import { applyChanges, validateFiles, type Change } from './proposal.ts';

export type GitHubTarget = { readonly owner: string; readonly repo: string; readonly branch: string };

export type SaveResult = { readonly commitSha: string; readonly commitUrl: string; readonly files: readonly string[] };

export class GitHubSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubSaveError';
  }
}

/** src/data/ の中のファイルの位置。 */
export const DATA_DIR = 'src/data';

const API = 'https://api.github.com';

/** 「owner/repo」を分ける。形が違えば null。 */
export const parseRepo = (text: string): { owner: string; repo: string } | null => {
  const m = /^\s*([\w.-]+)\/([\w.-]+)\s*$/.exec(text);
  return m === null || m[1] === undefined || m[2] === undefined ? null : { owner: m[1], repo: m[2] };
};

/** 書き出しと同じ形（2字下げ、末尾に改行）。開発サーバーの書き戻しと差分がそろう。 */
export const formatJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const decodeBase64 = (text: string): string => {
  const binary = atob(text.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

type Fetcher = typeof fetch;

const client = (token: string, fetcher: Fetcher) => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const init: RequestInit = {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetcher(`${API}${path}`, init);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new GitHubApiError(res.status, detail);
    }
    return (await res.json()) as T;
  };
  return request;
};

class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`GitHub の API が ${status} を返した：${detail.slice(0, 200)}`);
    this.status = status;
  }
}

/** API の失敗を、ユーザーが直せる言葉にする。 */
const explainApiError = (error: unknown, target: GitHubTarget): never => {
  if (error instanceof GitHubSaveError) throw error;
  if (error instanceof GitHubApiError) {
    if (error.status === 401) throw new GitHubSaveError('トークンが無効である。期限切れか、貼り間違いでないか確かめること。');
    if (error.status === 403) throw new GitHubSaveError(`トークンに ${target.owner}/${target.repo} の Contents の書き込み権限がない。`);
    if (error.status === 404) throw new GitHubSaveError(`${target.owner}/${target.repo} のブランチ ${target.branch} が見つからないか、トークンでは読めない。`);
    if (error.status === 409 || error.status === 422) throw new GitHubSaveError('保存の間にブランチが更新された。もう一度保存すること。');
    throw new GitHubSaveError(error.message);
  }
  throw new GitHubSaveError(`GitHub に接続できなかった：${String(error)}`);
};

/**
 * 調整案の変更点を GitHub のブランチに1つの commit として保存する。
 * 保存先の最新の JSON に変更点を適用し直し、食い違い（元の値の不一致）や検査の問題があれば保存しない。
 */
export const saveToGitHub = async (
  args: { readonly token: string; readonly target: GitHubTarget; readonly changes: readonly Change[]; readonly message: string },
  fetcher: Fetcher = fetch,
): Promise<SaveResult> => {
  const { token, target, changes, message } = args;
  if (token.trim() === '') throw new GitHubSaveError('GitHub のトークンがない。');
  if (changes.length === 0) throw new GitHubSaveError('変更点がない。');
  const request = client(token.trim(), fetcher);
  const repoPath = `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const names = [...new Set(changes.map((c) => c.file))];
  try {
    const ref = await request<{ object: { sha: string } }>('GET', `${repoPath}/git/ref/heads/${encodeURIComponent(target.branch)}`);
    const head = ref.object.sha;
    const headCommit = await request<{ tree: { sha: string } }>('GET', `${repoPath}/git/commits/${head}`);

    // 保存先の最新の JSON（変更するファイルだけ）。
    const remote: Record<string, unknown> = {};
    for (const name of names) {
      const file = await request<{ content?: string; encoding?: string }>(
        'GET',
        `${repoPath}/contents/${DATA_DIR}/${encodeURIComponent(name)}?ref=${head}`,
      );
      if (file.encoding !== 'base64' || file.content === undefined) throw new GitHubSaveError(`${name} の中身を読めなかった。`);
      remote[name] = JSON.parse(decodeBase64(file.content)) as unknown;
    }
    const { files, conflicts } = applyChanges(remote, changes);
    if (conflicts.length > 0) {
      throw new GitHubSaveError(
        `GitHub のデータが、この調整案を作った後に変わっている（${conflicts.length}件の元の値が食い違う：${[
          ...new Set(conflicts.map((c) => c.file)),
        ].join('、')}）。ページを読み込み直してから、変更をやり直すこと。`,
      );
    }

    const tree = await request<{ sha: string }>('POST', `${repoPath}/git/trees`, {
      base_tree: headCommit.tree.sha,
      tree: names.map((name) => ({ path: `${DATA_DIR}/${name}`, mode: '100644', type: 'blob', content: formatJson(files[name]) })),
    });
    const commit = await request<{ sha: string; html_url: string }>('POST', `${repoPath}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [head],
    });
    // 早送りだけで更新する。先に別の commit が入っていれば失敗する（上書きしない）。
    await request('PATCH', `${repoPath}/git/refs/heads/${encodeURIComponent(target.branch)}`, { sha: commit.sha, force: false });
    return { commitSha: commit.sha, commitUrl: commit.html_url, files: names };
  } catch (error) {
    return explainApiError(error, target);
  }
};

/** 保存の前の検査。保存先の最新の JSON に適用した結果ではなく、手元の作業中の写しで行う（画面の検査と同じ）。 */
export const checkBeforeSave = (work: DataFiles): string | null => {
  const issues = validateFiles(work);
  return issues.length === 0 ? null : `検査で問題が見つかったため保存しなかった（${issues.length}件）。`;
};
