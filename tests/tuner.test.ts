import { describe, expect, it } from 'vitest';
import { DATA_FILES, loadGameData, rawFromFiles } from '../src/data/index.ts';
import { finalScores } from '../src/game/scoring.ts';
import {
  applyChanges,
  changedFiles,
  createProposal,
  diffFiles,
  getAt,
  parseProposal,
  ProposalError,
  proposalFromWork,
  revertChange,
  serializeProposal,
  setInFiles,
  toMarkdown,
  validateFiles,
} from '../tools/tuner/proposal.ts';
import { playout } from './helpers/playout.ts';

const base = DATA_FILES;

describe('調整案の作成と差分（指示書 3-5）', () => {
  it('作成した調整案は名前・作成日・空の変更点を持つ', () => {
    // 指示書 3-5（調整案は名前・作成日・変更点の一覧を持つ）
    const p = createProposal('初期資源の見直し', new Date('2026-11-03T09:00:00Z'));
    expect(p).toMatchObject({ name: '初期資源の見直し', createdAt: '2026-11-03', changes: [] });
  });

  it('編集は写しに対して行い、元データは変わらない', () => {
    // 指示書 3-5（元データは変更しない）
    const work = setInFiles(base, 'params.json', ['initial', 'gold'], 5);
    expect(getAt(base['params.json'], ['initial', 'gold'])).toBe(0);
    expect(getAt(work['params.json'], ['initial', 'gold'])).toBe(5);
  });

  it('差分は末端の値ごとに、元の値と新しい値の組で持つ', () => {
    // 指示書 3-5（変更点の一覧：元の値 → 新しい値）
    let work = setInFiles(base, 'params.json', ['initial', 'gold'], 5);
    work = setInFiles(work, 'cards_civilization.json', ['cards', 3, 'cost', 'gold'], 7);
    work = setInFiles(work, 'board_1.json', ['squares', 'A1', 'terrain'], 'water');
    const changes = diffFiles(base, work);
    expect(changes).toEqual([
      { file: 'board_1.json', path: ['squares', 'A1', 'terrain'], before: getAt(base['board_1.json'], ['squares', 'A1', 'terrain']), after: 'water' },
      { file: 'cards_civilization.json', path: ['cards', 3, 'cost', 'gold'], before: 10, after: 7 },
      { file: 'params.json', path: ['initial', 'gold'], before: 0, after: 5 },
    ]);
  });

  it('配列の長さが変わったときは、配列全体を1つの変更点にする', () => {
    // 指示書 3-5（効果の命令を足す・除く）
    const script = getAt(base['cards_civilization.json'], ['cards', 3, 'script', 0, 'do']) as unknown[];
    const work = setInFiles(base, 'cards_civilization.json', ['cards', 3, 'script', 0, 'do'], [...script, { op: 'gain', res: 'gold', amount: 1 }]);
    const changes = diffFiles(base, work);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toEqual(['cards', 3, 'script', 0, 'do']);
  });

  it('変更点を1つずつ取り消せる', () => {
    // 指示書 3-5
    let work = setInFiles(base, 'params.json', ['initial', 'gold'], 5);
    work = setInFiles(work, 'params.json', ['initial', 'materials'], 9);
    const [first] = diffFiles(base, work);
    if (first === undefined) throw new Error('変更点がない');
    work = revertChange(work, first);
    expect(diffFiles(base, work)).toHaveLength(1);
  });
});

describe('保存と読み込み（指示書 3-5）', () => {
  it('JSON に保存して読み込むと同じ調整案になり、元データに適用できる', () => {
    // 指示書 3-5（JSON として保存・読み込みできる）
    const work = setInFiles(base, 'params.json', ['initial', 'gold'], 5);
    const proposal = proposalFromWork({ name: '金5', createdAt: '2026-11-03' }, base, work);
    const loaded = parseProposal(serializeProposal(proposal));
    expect(loaded).toEqual(proposal);
    const { files, conflicts } = applyChanges(base, loaded.changes);
    expect(conflicts).toEqual([]);
    expect(diffFiles(base, files)).toEqual(proposal.changes);
  });

  it('元データが変わっていて元の値が食い違う変更点は、適用せずに知らせる', () => {
    // 指示書 3-5（読み込み）
    const proposal = proposalFromWork(
      { name: '食い違い', createdAt: '2026-11-03' },
      base,
      setInFiles(base, 'params.json', ['initial', 'gold'], 5),
    );
    const changedBase = setInFiles(base, 'params.json', ['initial', 'gold'], 3);
    const { files, conflicts } = applyChanges(changedBase, proposal.changes);
    expect(conflicts).toHaveLength(1);
    expect(getAt(files['params.json'], ['initial', 'gold'])).toBe(3);
  });

  it('形の違うファイルは読み込まない', () => {
    // 指示書 3-5
    expect(() => parseProposal('not json')).toThrow(ProposalError);
    expect(() => parseProposal('{"format":"other"}')).toThrow('調整案のファイルではない');
    expect(() =>
      parseProposal(JSON.stringify({ format: 'city-boardgame-proposal', version: 1, name: 'x', createdAt: '2026-11-03', changes: [{ file: 'a' }] })),
    ).toThrow('変更点 0');
  });
});

describe('保存前の検査（指示書 3-5）', () => {
  it('元データは検査を通る', () => {
    // 指示書 3-5
    expect(validateFiles(base)).toEqual([]);
  });

  it('型の違い・範囲外の値・存在しない ID・地形の内訳の不一致を検出する', () => {
    // rules.md v0.8 2-1-5、7-3-1、指示書 3-5
    expect(validateFiles(setInFiles(base, 'params.json', ['initial', 'gold'], 'たくさん'))[0]?.path).toBe('params.initial.gold');
    expect(validateFiles(setInFiles(base, 'params.json', ['initial', 'gold'], -1))[0]?.path).toBe('params.initial.gold');
    expect(validateFiles(setInFiles(base, 'params.json', ['raid', 'firstRoundCard'], 9)).map((i) => i.path)).toContain(
      'params.raid.firstRoundCard',
    );
    const terrain = getAt(base['board_2.json'], ['squares', 'A1', 'terrain']) === 'water' ? 'plains' : 'water';
    expect(validateFiles(setInFiles(base, 'board_2.json', ['squares', 'A1', 'terrain'], terrain)).map((i) => i.path)).toContain(
      'boards[1].squares',
    );
  });

  it('命令セットにない命令を検出する', () => {
    // 指示書 3-5（命令セットにない記述はできない）
    const work = setInFiles(base, 'cards_civilization.json', ['cards', 0, 'script', 0, 'do', 0, 'op'], 'teleport');
    expect(validateFiles(work)[0]?.message).toContain('script');
  });
});

describe('書き出し（指示書 3-5）', () => {
  it('変更のあったファイルだけを書き戻し、変更点を Markdown の表にする', () => {
    // 指示書 3-5（差分を書き戻す、Markdown で出力する）
    let work = setInFiles(base, 'params.json', ['initial', 'gold'], 5);
    work = setInFiles(work, 'cards_civilization.json', ['cards', 3, 'cost', 'gold'], 7);
    const proposal = proposalFromWork({ name: '序盤の金', createdAt: '2026-11-03' }, base, work);
    expect(Object.keys(changedFiles(proposal, work)).sort()).toEqual(['cards_civilization.json', 'params.json']);
    const md = toMarkdown(proposal, base);
    expect(md).toContain('## 序盤の金');
    expect(md).toContain('| cards_civilization.json | cards[004].cost.gold | `10` | `7` |');
    expect(md).toContain('| params.json | initial.gold | `0` | `5` |');
  });
});

describe('調整案を適用したゲームの性質', () => {
  it('調整案を適用したデータで、乱択プレイアウトが詰まらず終局する', () => {
    // 指示書 3-5（調整案を適用したゲームが性質テストを通ること）、rules.md v0.8 12-1-1、1-0-6
    let work = setInFiles(base, 'params.json', ['initial', 'gold'], 10);
    work = setInFiles(work, 'params.json', ['buildings', 'cost', 'house', 'materials'], 1);
    work = setInFiles(work, 'cards_civilization.json', ['cards', 3, 'cost', 'gold'], 3);
    work = setInFiles(work, 'params.json', ['actions', 'pioneer', 'normal', 'maxTiles'], 3);
    expect(validateFiles(work)).toEqual([]);
    const d = loadGameData(rawFromFiles(work));
    for (const players of [3, 4]) {
      for (let i = 0; i < 20; i += 1) {
        const result = playout(players, 7000 + players * 100 + i, 5000, d);
        expect(result.stuck).toBe(false);
        expect(result.state.phase).toBe('over');
        expect(finalScores(result.state, d)).toHaveLength(players);
      }
    }
  }, 120_000);
});
