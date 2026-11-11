import { describe, expect, it } from 'vitest';
import { DATA_FILES, GAME_DATA, loadGameData, rawFromFiles } from '../src/data/index.ts';
import { selfPlayGame } from '../src/game/selfplay.ts';
import { isGameOver } from '../src/game/engine.ts';
import { finalScores } from '../src/game/scoring.ts';
import {
  applyChanges,
  changedFiles,
  createProposal,
  diffFiles,
  getAt,
  isNewItem,
  newItemFrom,
  nextId,
  parseProposal,
  ProposalError,
  proposalFromWork,
  restoreWork,
  revertChange,
  serializeProposal,
  setInFiles,
  storeWork,
  summarizeChange,
  toMarkdown,
  selfPlayFiles,
  validateFiles,
} from '../tools/tuner/proposal.ts';
import { playout, yieldToRunner } from './helpers/playout.ts';
import { anchorCells, isConnected, rotateCells } from '../tools/tuner/ShapeEditor.tsx';

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

  it('自動対戦で確かめ、元データでは問題がない（ユーザー決定 2026-11-11、再発防止の C）', async () => {
    // rules.md v0.8 12-1-1、1-0-6
    expect(await selfPlayFiles(base)).toEqual([]);
  });

  it('自動対戦は処理が止まるデータを問題として返す（例外で止めない）', () => {
    // rules.md v0.8 2-6-2（個人ボードがなければ準備できない）
    const problems = selfPlayGame(3, 1, { ...GAME_DATA, boards: [] });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('処理が止まった');
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
  it('調整案を適用したデータで、乱択プレイアウトが詰まらず終局する', async () => {
    // 指示書 3-5（調整案を適用したゲームが性質テストを通ること）、rules.md v0.8 12-1-1、1-0-6
    let work = setInFiles(base, 'params.json', ['initial', 'gold'], 10);
    work = setInFiles(work, 'params.json', ['buildings', 'cost', 'house', 'materials'], 1);
    work = setInFiles(work, 'cards_civilization.json', ['cards', 3, 'cost', 'gold'], 3);
    work = setInFiles(work, 'params.json', ['actions', 'pioneer', 'normal', 'maxTiles'], 3);
    expect(validateFiles(work)).toEqual([]);
    const d = loadGameData(rawFromFiles(work));
    for (const players of [3, 4]) {
      for (let i = 0; i < 20; i += 1) {
        await yieldToRunner();
        const result = playout(players, 7000 + players * 100 + i, 5000, d);
        expect(result.stuck).toBe(false);
        expect(result.state.phase).toBe('over');
        expect(finalScores(result.state, d)).toHaveLength(players);
      }
    }
  }, 120_000);
});

describe('新しいカード（ユーザー決定 2026-11-04）', () => {
  it('識別子は一覧の形に合わせて次の番号にする', () => {
    // 指示書 3-5（チューナーでカードを新しく作る）
    expect(nextId(['001', '002', '042'])).toBe('043');
    expect(nextId(['PC01', 'PC08'])).toBe('PC09');
    expect(nextId([1, 2, 10])).toBe(11);
    expect(nextId(['hero', 'merchant'])).toBe('custom_1');
    expect(nextId(['hero', 'custom_1'])).toBe('custom_2');
  });

  it('写したカードは新しい識別子・仮置きの印を持ち、原本の解釈は写さない', () => {
    // 指示書 3-5、指示書 1（仮置きの印）
    const cards = getAt(base['cards_civilization.json'], ['cards']) as Record<string, unknown>[];
    const created = newItemFrom(cards, 0) as Record<string, unknown>;
    expect(created['id']).toBe(String(cards.length + 1).padStart(3, '0'));
    expect(created['name']).toBe(`${String(cards[0]?.['name'])}（写し）`);
    expect(created['provisional']).toBe(true);
    expect(created['clarifications']).toEqual([]);
    expect(isNewItem(cards, created)).toBe(true);
    expect(isNewItem(cards, cards[0])).toBe(false);
  });

  it('カードの一覧の変更点は、件数と追加した識別子で短く表す', () => {
    // 指示書 3-5（変更点の一覧）
    const cards = getAt(base['cards_civilization.json'], ['cards']) as unknown[];
    const after = [...cards, newItemFrom(cards, 0)];
    const summary = summarizeChange({ file: 'cards_civilization.json', path: ['cards'], before: cards, after });
    const n = cards.length;
    const id = String(n + 1).padStart(3, '0');
    expect(summary).toEqual({ before: `${n}件`, after: `${n + 1}件`, note: `追加：${id}` });
    const work = setInFiles(base, 'cards_civilization.json', ['cards'], after);
    expect(toMarkdown(proposalFromWork({ name: '新カード', createdAt: '2026-11-04' }, base, work), base)).toContain(`\`${n + 1}件（追加：${id}）\``);
  });

  it('新しい文明カード・キャラクターを加えたデータは検査を通り、乱択プレイアウトが終局する', () => {
    // rules.md v0.8 1-0-6（新しいカードを含むデータでも遊べる）
    let files = base;
    for (const [file, key] of [
      ['cards_civilization.json', 'cards'],
      ['characters.json', 'characters'],
      ['special_citizens.json', 'cards'],
      ['cards_planned_city.json', 'cards'],
      ['cards_nature_park.json', 'cards'],
    ] as const) {
      const list = getAt(files[file], [key]) as unknown[];
      files = setInFiles(files, file, [key], [...list, newItemFrom(list, 0)]);
    }
    expect(validateFiles(files)).toEqual([]);
    const data = loadGameData(rawFromFiles(files));
    const added = String((getAt(base['cards_civilization.json'], ['cards']) as unknown[]).length + 1).padStart(3, '0');
    expect(data.civilizationCards.some((c) => c.id === added)).toBe(true);
    for (const seed of [1, 2]) {
      const result = playout(4, seed, 4000, data);
      expect(result.stuck).toBe(false);
      expect(isGameOver(result.state)).toBe(true);
    }
  });
});

describe('形の編集（ユーザー決定 2026-11-08）', () => {
  it('60度回して最初のマスを原点にそろえても、マスのつながりは保たれる', () => {
    // CLAUDE.md「データの約束事」（アキシャル座標と6方向の隣接）、rules.md v0.8 13-2・14-2
    const line = [
      { q: 0, r: 0, terrain: null },
      { q: 1, r: 0, terrain: null },
      { q: 2, r: 0, terrain: null },
    ];
    const turned = anchorCells(rotateCells(line));
    expect(turned.map((c) => [c.q, c.r])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(isConnected(turned)).toBe(true);
    // 6回まわすと元に戻る。
    let shape = line;
    for (let i = 0; i < 6; i += 1) shape = anchorCells(rotateCells(shape));
    expect(shape.map((c) => [c.q, c.r])).toEqual(line.map((c) => [c.q, c.r]));
  });

  it('辺でつながっていないマスがあれば知らせる', () => {
    // rules.md v0.8 13-2（計画都市の形はつながった建物の並び）
    expect(isConnected([{ q: 0, r: 0 }, { q: 1, r: -1 }])).toBe(true);
    expect(isConnected([{ q: 0, r: 0 }, { q: 2, r: 0 }])).toBe(false);
  });
});

describe('作業中の写しの保ち方（2026-11-09）', () => {
  it('元データが更新されても、写しを開き直したときに更新前の値へ戻さない', () => {
    // 2026-11-09 の不具合：データ一式で保った写しを、元データの更新後に開くと最上位のワーカー数が 2 から 3 に戻った。
    // rules.md v0.8 6-1（ワーカー数は 2026-11-07 のユーザー決定で最上位2人）
    type Params = { rounds: number; actions: { workerCost: { top: number } } };
    const oldBase = structuredClone(DATA_FILES);
    (oldBase['params.json'] as Params).actions.workerCost.top = 3;
    // 古い元データの上で、ラウンド数だけを変えた写し。
    const oldWork = structuredClone(oldBase);
    (oldWork['params.json'] as Params).rounds = 6;
    const stored = storeWork(oldBase, oldWork, 'old');
    const restored = restoreWork(DATA_FILES, 'new', JSON.parse(JSON.stringify(stored)));
    const params = restored.files['params.json'] as Params;
    expect(params.actions.workerCost.top).toBe((DATA_FILES['params.json'] as Params).actions.workerCost.top);
    expect(params.rounds).toBe(6);
    expect(restored.rebased).toBe(true);
    expect(restored.conflicts).toEqual([]);
  });

  it('以前の形式（データ一式）の写しは自動では当てない', () => {
    // 以前の形式からは、どの値が利用者の変更か分からない。
    const legacy = structuredClone(DATA_FILES);
    const restored = restoreWork(DATA_FILES, 'v', legacy);
    expect(restored.files).toBe(DATA_FILES);
    expect(restored.legacy).not.toBeNull();
  });
});
