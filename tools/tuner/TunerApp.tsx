// チューナー（指示書 3-5）：データの編集・調整案の保存と読み込み・試遊・書き出し。
// 編集は作業中の写し（調整案）に対して行い、元データ（src/data/）は書き出しまで変更しない。
// 作業中の写しはブラウザに保存し、再読み込みしても続きから編集できる。
// 公開ページ（GitHub Pages の tuner/）では、開発サーバーへの書き出しの代わりに GitHub への保存（github.ts）を使う。

import { useEffect, useMemo, useState } from 'react';
import { DATA_FILES, isBoardFileName, type DataFiles } from '../../src/data/index.ts';
import { BoardEditor } from './BoardEditor.tsx';
import { CardPreview } from './CardPreview.tsx';
import { ShapeEditor, type ShapeCellValue } from './ShapeEditor.tsx';
import { GitHubSaveError, parseRepo, saveToGitHub } from './github.ts';
import { keyLabel } from './labels.ts';
import { JsonEditor, type OnSet } from './JsonEditor.tsx';
import {
  applyChanges,
  changedFiles,
  createProposal,
  diffFiles,
  formatDate,
  formatPath,
  getAt,
  isNewItem,
  newItemFrom,
  parseProposal,
  ProposalError,
  proposalFromWork,
  revertChange,
  serializeProposal,
  setInFiles,
  summarizeChange,
  toMarkdown,
  validateFiles,
  type Change,
} from './proposal.ts';
import { ScriptEditor } from './ScriptEditor.tsx';

type Kind = { id: string; label: string; file: string | null; listKey: string | null };

const KINDS: readonly Kind[] = [
  { id: 'params', label: 'パラメータ', file: 'params.json', listKey: null },
  { id: 'boards', label: '個人ボード', file: null, listKey: null },
  { id: 'civ', label: '文明カード', file: 'cards_civilization.json', listKey: 'cards' },
  { id: 'planned', label: '計画都市カード', file: 'cards_planned_city.json', listKey: 'cards' },
  { id: 'nature', label: '自然公園カード', file: 'cards_nature_park.json', listKey: 'cards' },
  { id: 'sc', label: '特別な市民カード', file: 'special_citizens.json', listKey: 'cards' },
  { id: 'char', label: 'キャラクター', file: 'characters.json', listKey: 'characters' },
  { id: 'raid', label: '襲撃カード', file: 'raid_cards.json', listKey: 'cards' },
  { id: 'bonus', label: 'ボーナスタイル', file: 'bonus_tiles.json', listKey: 'tiles' },
];

const STORE_WORK = 'tuner:work';
const STORE_META = 'tuner:meta';
const STORE_PLAYTEST = 'tuner:playtest-files';
const STORE_GITHUB = 'tuner:github';

/** 開発サーバー（npm run tuner）か。公開ページでは src/data/ に書き戻せない。 */
const DEV_SERVER = import.meta.env.DEV;

/** 保存先のリポジトリの初期値。公開ページのビルドで GitHub Actions が与える（owner/repo）。 */
const DEFAULT_REPO = String(import.meta.env['VITE_GITHUB_REPO'] ?? '');

type GitHubSettings = { repo: string; branch: string; token: string };

const load = <T,>(key: string, fallback: T): T => {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};

const save = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても編集は続けられる。
  }
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const itemLabel = (item: unknown, i: number): string => {
  if (!isObject(item)) return String(i);
  const id = item['id'];
  const name = item['name'];
  return `${String(id ?? i)}${typeof name === 'string' ? `　${name}` : ''}`;
};

export const TunerApp = () => {
  const base = DATA_FILES;
  const [work, setWork] = useState<DataFiles>(() => {
    // 保存した写しが元データと食い違う（元データが書き換わった）場合は、変更点を適用し直す。
    const stored = load<DataFiles | null>(STORE_WORK, null);
    if (stored === null) return base;
    try {
      return applyChanges(base, diffFiles(base, stored)).files;
    } catch {
      return base;
    }
  });
  const [meta, setMeta] = useState(() => load(STORE_META, { name: '新しい調整案', createdAt: formatDate(new Date()) }));
  const [kind, setKind] = useState<Kind>(KINDS[0] ?? { id: 'params', label: '', file: 'params.json', listKey: null });
  const [itemIndex, setItemIndex] = useState(0);
  const [boardFile, setBoardFile] = useState('board_1.json');
  const [issues, setIssues] = useState<{ path: string; message: string }[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [github, setGithub] = useState<GitHubSettings>(() => {
    const stored = load<Partial<GitHubSettings>>(STORE_GITHUB, {});
    return { repo: stored.repo || DEFAULT_REPO, branch: stored.branch || 'main', token: stored.token ?? '' };
  });
  const [githubOpen, setGithubOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  useEffect(() => save(STORE_WORK, work), [work]);
  useEffect(() => save(STORE_META, meta), [meta]);
  useEffect(() => save(STORE_GITHUB, github), [github]);

  const changes = useMemo(() => diffFiles(base, work), [base, work]);
  const proposal = useMemo(() => proposalFromWork(meta, base, work), [meta, base, work]);

  const fileOf = (k: Kind): string => (k.id === 'boards' ? boardFile : (k.file ?? 'params.json'));
  const onSetIn =
    (file: string, prefix: (string | number)[]): OnSet =>
    (path, value) =>
      setWork((w) => setInFiles(w, file, [...prefix, ...path], value));

  /** 保存・試遊・書き出しの前に検査する（指示書 3-5）。問題があれば止める。 */
  const check = (): boolean => {
    const found = validateFiles(work);
    setIssues(found);
    return found.length === 0;
  };

  const download = (): void => {
    if (!check()) {
      setMessage('検査で問題が見つかったため保存しなかった。問題を直してから保存すること。');
      return;
    }
    const blob = new Blob([serializeProposal(proposal)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proposal.name}_${proposal.createdAt}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`保存した（変更点 ${proposal.changes.length}件）`);
  };

  const upload = (file: File): void => {
    void file.text().then((text) => {
      try {
        const loaded = parseProposal(text);
        const { files, conflicts } = applyChanges(base, loaded.changes);
        setWork(files);
        setMeta({ name: loaded.name, createdAt: loaded.createdAt });
        setMessage(
          conflicts.length === 0
            ? `読み込んだ：${loaded.name}（変更点 ${loaded.changes.length}件）`
            : `読み込んだが、元データと元の値が食い違う変更点 ${conflicts.length}件は適用しなかった：${conflicts
                .map((c) => `${c.file} ${formatPath(base, c)}`)
                .join('、')}`,
        );
      } catch (error) {
        setMessage(error instanceof ProposalError ? `読み込めない：${error.message}` : String(error));
      }
    });
  };

  const playtest = (): void => {
    if (!check()) {
      setMessage('検査で問題が見つかったため試遊できない。');
      return;
    }
    save(STORE_PLAYTEST, work);
    // 開発サーバーでも公開ページでも、チューナーと同じ場所にある play.html を開く。
    window.open('play.html', '_blank');
  };

  const exportToData = (): void => {
    if (!check()) {
      setMessage('検査で問題が見つかったため書き出さなかった。');
      return;
    }
    if (proposal.changes.length === 0) {
      setMessage('変更点がない。');
      return;
    }
    const md = toMarkdown(proposal, base);
    void fetch('/__tuner/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: changedFiles(proposal, work) }),
    })
      .then(async (res) => {
        const body = (await res.json()) as { written?: string[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        setMarkdown(md);
        setMessage(`src/data/ に書き戻した：${(body.written ?? []).join('、')}。変更点の一覧を claude/tuning_log.md に転記すること。`);
      })
      .catch((error: unknown) => setMessage(`書き戻せなかった：${String(error)}`));
  };

  /** GitHub に1つの commit として保存する（案A、ユーザー決定 2026-11-04）。 */
  const saveGitHub = (): void => {
    setSavedUrl(null);
    if (!check()) {
      setMessage('検査で問題が見つかったため GitHub に保存しなかった。');
      return;
    }
    if (proposal.changes.length === 0) {
      setMessage('変更点がない。');
      return;
    }
    const repo = parseRepo(github.repo);
    if (repo === null || github.branch.trim() === '' || github.token.trim() === '') {
      setGithubOpen(true);
      setMessage('GitHub の設定（リポジトリ・ブランチ・トークン）を入れること。');
      return;
    }
    const md = toMarkdown(proposal, base);
    setSaving(true);
    setMessage('GitHub に保存しています…');
    saveToGitHub({
      token: github.token,
      target: { ...repo, branch: github.branch.trim() },
      changes: proposal.changes,
      message: `調整案「${proposal.name}」を反映する\n\nチューナーから保存した。\n\n${md}`,
    })
      .then((result) => {
        setMarkdown(md);
        setSavedUrl(result.commitUrl);
        setMessage(
          `GitHub の ${github.branch} に保存した（${result.files.join('、')}）。` +
            (github.branch.trim() === 'main'
              ? '数分で公開ページと Edge Function が配置し直される。反映後にこのページを読み込み直すと、変更点は0件になる。'
              : 'main に取り込むと公開ページに反映される。'),
        );
      })
      .catch((error: unknown) => setMessage(error instanceof GitHubSaveError ? error.message : `保存できなかった：${String(error)}`))
      .finally(() => setSaving(false));
  };

  /** いま選んでいるカードを写して、新しいカードを一覧の最後に加える。 */
  const addItem = (): void => {
    if (kind.listKey === null || kind.file === null) return;
    const current = (getAt(work[kind.file], [kind.listKey]) as unknown[] | undefined) ?? [];
    try {
      const created = newItemFrom(current, Math.min(itemIndex, current.length - 1));
      setWork((w) => setInFiles(w, kind.file ?? '', [kind.listKey ?? ''], [...current, created]));
      setItemIndex(current.length);
      setMessage(`${kind.label}を新しく作った（いま選んでいたカードの写し）。値を直してから試遊・保存すること。`);
    } catch (error) {
      setMessage(error instanceof ProposalError ? error.message : String(error));
    }
  };

  /** 新しく作ったカードを消す。元データにあるカードは消さない（他のデータから参照されている場合があるため）。 */
  const removeItem = (): void => {
    if (kind.listKey === null || kind.file === null) return;
    const current = (getAt(work[kind.file], [kind.listKey]) as unknown[] | undefined) ?? [];
    const baseList = (getAt(base[kind.file], [kind.listKey]) as unknown[] | undefined) ?? [];
    if (!isNewItem(baseList, current[itemIndex])) return;
    setWork((w) => setInFiles(w, kind.file ?? '', [kind.listKey ?? ''], current.filter((_, i) => i !== itemIndex)));
    setItemIndex(Math.max(0, itemIndex - 1));
    setMessage('新しく作ったカードを消した。');
  };

  const reset = (): void => {
    setWork(base);
    setMeta({ name: '新しい調整案', createdAt: formatDate(new Date()) });
    setIssues(null);
    setMessage('元データに戻した');
  };

  const file = fileOf(kind);
  const list = kind.listKey ? (getAt(work[file], [kind.listKey]) as unknown[] | undefined) ?? [] : [];
  const item = kind.listKey ? list[itemIndex] : work[file];
  const baseList = kind.listKey ? ((getAt(base[file], [kind.listKey]) as unknown[] | undefined) ?? []) : [];
  const itemIsNew = kind.listKey !== null && isNewItem(baseList, item);
  // 新しいカードは元データに同じカードがない。添字で比べると別のカードと比べてしまうため、比べる相手を持たない。
  const baseItem = kind.listKey ? (itemIsNew ? undefined : getAt(base[file], [kind.listKey, itemIndex])) : base[file];
  const prefix: (string | number)[] = kind.listKey ? [kind.listKey, itemIndex] : [];
  const boardFiles = Object.keys(work).filter(isBoardFileName).sort();
  const expectedTerrain = (getAt(work['params.json'], ['board', 'terrainCounts']) ?? {}) as Record<string, number>;
  const changedIn = (k: Kind): number =>
    changes.filter((c) => (k.id === 'boards' ? isBoardFileName(c.file) : c.file === k.file)).length;

  return (
    <div className="tuner">
      <header className="tuner-top">
        <a className="btn small" href={DEV_SERVER ? '/' : '../'}>
          ゲームへ
        </a>
        <strong>チューナー</strong>
        <label>
          調整案の名前
          <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
        </label>
        <span className="muted">作成日 {meta.createdAt}</span>
        <button type="button" className="btn" onClick={() => check()}>
          検査
        </button>
        <button type="button" className="btn" onClick={download}>
          保存
        </button>
        <label className="btn">
          読み込み
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <button type="button" className="btn primary" onClick={playtest}>
          試遊
        </button>
        {DEV_SERVER ? (
          <button type="button" className="btn primary" onClick={exportToData}>
            書き出し
          </button>
        ) : null}
        <button type="button" className="btn primary" data-ui="github-save" disabled={saving} onClick={saveGitHub}>
          GitHub に保存
        </button>
        <button type="button" className="btn" data-ui="github-settings" onClick={() => setGithubOpen(!githubOpen)}>
          GitHub の設定
        </button>
        <button type="button" className="btn" disabled title="シミュレーションによる比較は別の指示書で扱う">
          検証（未実装）
        </button>
        <button type="button" className="btn" onClick={reset}>
          元に戻す
        </button>
        {/* スマホでは変更点と検査の欄が編集欄の下に回るため、そこへ飛ぶ印を出す。 */}
        <a className="btn small jump-side" href="#tuner-side" data-ui="jump-side">
          変更点 {changes.length}件・検査へ
        </a>
      </header>

      {githubOpen ? (
        <div className="tuner-github">
          <label>
            リポジトリ
            <input value={github.repo} placeholder="owner/repo" onChange={(e) => setGithub({ ...github, repo: e.target.value })} />
          </label>
          <label>
            ブランチ
            <input value={github.branch} onChange={(e) => setGithub({ ...github, branch: e.target.value })} />
          </label>
          <label>
            トークン
            <input
              type="password"
              autoComplete="off"
              value={github.token}
              placeholder="github_pat_…"
              onChange={(e) => setGithub({ ...github, token: e.target.value })}
            />
          </label>
          <button type="button" className="btn small" onClick={() => setGithub({ ...github, token: '' })}>
            トークンを消す
          </button>
          <p className="muted small">
            トークンは、このリポジトリだけを対象に「Contents：Read and write」を許した fine-grained personal access token を使う。
            このブラウザにだけ保存し、他には送らない（GitHub の API を除く）。共用のパソコンでは、使い終わったら消すこと。
          </p>
        </div>
      ) : null}

      {message ? (
        <div className="tuner-message">
          {message}
          {savedUrl !== null ? (
            <>
              {' '}
              <a href={savedUrl} target="_blank" rel="noreferrer">
                commit を見る
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="tuner-body">
        <nav className="tuner-kinds">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`kind${k.id === kind.id ? ' active' : ''}`}
              onClick={() => {
                setKind(k);
                setItemIndex(0);
              }}
            >
              {k.label}
              {changedIn(k) > 0 ? <span className="badge">{changedIn(k)}</span> : null}
            </button>
          ))}
        </nav>

        {kind.id === 'boards' ? (
          <nav className="tuner-items">
            {/* スマホでは一覧の代わりに選択欄を出す（ユーザー決定 2026-11-09）。 */}
            <select className="items-select" data-ui="items-select" value={boardFile} onChange={(e) => setBoardFile(e.target.value)} aria-label="個人ボード">
              {boardFiles.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {boardFiles.map((name) => (
              <button key={name} type="button" className={`item${name === boardFile ? ' active' : ''}`} onClick={() => setBoardFile(name)}>
                {name}
              </button>
            ))}
          </nav>
        ) : kind.listKey ? (
          <nav className="tuner-items">
            <div className="item-actions">
              <button type="button" className="btn small" data-ui="item-add" onClick={addItem}>
                新しく作る（選んでいるカードを写す）
              </button>
              {itemIsNew ? (
                <button type="button" className="btn small" data-ui="item-remove" onClick={removeItem}>
                  このカードを消す
                </button>
              ) : null}
            </div>
            <select className="items-select" data-ui="items-select" value={itemIndex} onChange={(e) => setItemIndex(Number(e.target.value))} aria-label={kind.label}>
              {list.map((it, i) => (
                <option key={i} value={i}>
                  {itemLabel(it, i)}
                  {isNewItem(baseList, it) ? '（新）' : ''}
                </option>
              ))}
            </select>
            {list.map((it, i) => (
              <button key={i} type="button" className={`item${i === itemIndex ? ' active' : ''}`} onClick={() => setItemIndex(i)}>
                {itemLabel(it, i)}
                {isNewItem(baseList, it) ? <span className="badge new">新</span> : null}
              </button>
            ))}
          </nav>
        ) : (
          // 一覧のない種類（パラメータ）でも列をそろえ、編集欄が一覧の列に入り込まないようにする。
          <nav className="tuner-items" aria-hidden="true" />
        )}

        <main className="tuner-editor">
          {kind.id === 'boards' ? (
            <BoardEditor
              value={work[boardFile] as never}
              base={base[boardFile] as never}
              expected={expectedTerrain}
              onSet={onSetIn(boardFile, [])}
            />
          ) : (
            <>
              <CardPreview kind={kind.id} item={item} onSet={onSetIn(file, prefix)} />
              {kind.id === 'planned' && isObject(item) && Array.isArray(item['slots']) ? (
                <section>
                  <h3>形（マス目を押して編集）</h3>
                  <ShapeEditor
                    cells={item['slots'] as ShapeCellValue[]}
                    base={isObject(baseItem) ? (baseItem['slots'] as ShapeCellValue[]) : undefined}
                    mode="planned"
                    onChange={(cells) => onSetIn(file, prefix)(['slots'], cells)}
                  />
                </section>
              ) : null}
              {kind.id === 'nature' && isObject(item) && Array.isArray(item['sets']) ? (
                <section>
                  <h3>組の形（マス目を押して編集）</h3>
                  {(item['sets'] as { cells: ShapeCellValue[] }[]).map((set, i) => (
                    <div key={i} className="shape-set">
                      <div className="shape-set-head">
                        <b>
                          組{i + 1}（{set.cells.length}枚）
                        </b>
                        <button
                          type="button"
                          className="btn small"
                          data-ui="set-remove"
                          disabled={(item['sets'] as unknown[]).length <= 1}
                          onClick={() => onSetIn(file, prefix)(['sets'], (item['sets'] as unknown[]).filter((_, j) => j !== i))}
                        >
                          この組を消す
                        </button>
                      </div>
                      <ShapeEditor
                        cells={set.cells}
                        base={isObject(baseItem) ? (baseItem['sets'] as { cells: ShapeCellValue[] }[] | undefined)?.[i]?.cells : undefined}
                        mode="nature"
                        onChange={(cells) => onSetIn(file, prefix)(['sets', i, 'cells'], cells)}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn small"
                    data-ui="set-add"
                    onClick={() => onSetIn(file, prefix)(['sets'], [...(item['sets'] as unknown[]), { cells: [{ q: 0, r: 0, terrain: 'forest' }, { q: 1, r: 0, terrain: 'forest' }] }])}
                  >
                    組を足す
                  </button>
                </section>
              ) : null}
              <JsonEditor
                value={item}
                base={baseItem}
                path={[]}
                onSet={onSetIn(file, prefix)}
                skip={['script', ...(kind.id === 'planned' ? ['slots'] : []), ...(kind.id === 'nature' ? ['sets'] : [])]}
                unlocked={itemIsNew}
              />
              {isObject(item) && 'script' in item ? (
                <section>
                  <h3>効果（命令と引数）</h3>
                  <ScriptEditor value={item['script']} onChange={(v) => onSetIn(file, prefix)(['script'], v)} />
                </section>
              ) : null}
            </>
          )}
        </main>

        <aside className="tuner-side" id="tuner-side">
          <section>
            <h3>変更点 {changes.length}件</h3>
            <ol className="changes">
              {changes.map((c: Change, i) => (
                <li key={i}>
                  <span className="muted small">{c.file}</span> {formatPath(base, c, keyLabel)}
                  <div className="small">
                    <code>{summarizeChange(c).before}</code> → <code>{summarizeChange(c).after}</code>
                    {summarizeChange(c).note !== null ? <div className="muted">{summarizeChange(c).note}</div> : null}
                  </div>
                  <button type="button" className="btn small" onClick={() => setWork((w) => revertChange(w, c))}>
                    取り消す
                  </button>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3>検査</h3>
            {issues === null ? (
              <p className="muted small">保存・試遊・書き出しの前に自動で行う。</p>
            ) : issues.length === 0 ? (
              <p className="ok">問題なし</p>
            ) : (
              <ul className="issues">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <code>{issue.path}</code> {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="verify-frame">
            <h3>検証（シミュレーションによる比較）</h3>
            <p className="muted small">balance-sim のエージェント作成後に、別の指示書で実装する。</p>
          </section>
          {markdown ? (
            <section>
              <h3>変更点の一覧（Markdown）</h3>
              <textarea readOnly value={markdown} rows={10} />
              <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(markdown)}>
                写す
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
};
