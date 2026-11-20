// チューナーの編集範囲の見直し（ユーザー決定 2026-11-19、見直し案1〜6）。
import { describe, expect, it } from 'vitest';
import { checkGameData, checkGameDataWarnings, DATA_FILES, GAME_DATA, parseGameData, rawFromFiles, type DataFiles } from '../src/data/index.ts';
import type { Script } from '../src/data/script.ts';
import { isReadOnly, optionalFieldsAt } from '../tools/tuner/JsonEditor.tsx';
import { getAt, setInFiles, staleTexts } from '../tools/tuner/proposal.ts';
import { ratePoints } from '../src/game/scoring.ts';

const base = DATA_FILES;

describe('読むだけの項目（見直し案1・2）', () => {
  it('建物の効果の数値（params の effects）は編集でき、キャラクターの原本の文言は読むだけのまま', () => {
    // 指示書 3-5（識別子と原本の文言は読むだけ）、ユーザー決定 2026-11-19
    expect(isReadOnly('effects', false, 'params.json')).toBe(false);
    expect(isReadOnly('effects', false, 'characters.json')).toBe(true);
    expect(isReadOnly('effects', false, 'special_citizens.json')).toBe(true);
  });

  it('文明カードとボーナスタイルの文言は編集でき、識別子はどこでも読むだけ', () => {
    // ユーザー決定 2026-11-19（見直し案2）
    expect(isReadOnly('text', false, 'cards_civilization.json')).toBe(false);
    expect(isReadOnly('text', false, 'bonus_tiles.json')).toBe(false);
    expect(isReadOnly('text', false, 'raid_cards.json')).toBe(true);
    expect(isReadOnly('id', false, 'params.json')).toBe(true);
  });
});

describe('省略できる項目（見直し案3）', () => {
  const cases: { file: string; path: (string | number)[]; listKey?: string }[] = [
    { file: 'params.json', path: [] },
    { file: 'params.json', path: ['workers'] },
    { file: 'params.json', path: ['actions', 'research', 'normal'] },
    { file: 'params.json', path: ['raid'] },
    { file: 'characters.json', path: [], listKey: 'characters' },
    { file: 'special_citizens.json', path: [], listKey: 'cards' },
  ];
  it('どの項目も、既定値で設定したデータが型検査と整合検査を通る', () => {
    // ユーザー決定 2026-11-19（types.ts の省略できる項目との突き合わせ）
    for (const c of cases) {
      const prefix = c.listKey === undefined ? [] : [c.listKey, 0];
      const obj = getAt(base[c.file], [...prefix, ...c.path]) as Record<string, unknown>;
      const fields = optionalFieldsAt(c.file, c.path);
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        const files: DataFiles = setInFiles(base, c.file, [...prefix, ...c.path, f.key], f.initial(obj));
        expect(() => parseGameData(rawFromFiles(files)), `${c.file} ${f.key}`).not.toThrow();
        expect(checkGameData(parseGameData(rawFromFiles(files))), `${c.file} ${f.key}`).toEqual([]);
      }
    }
  });
});

describe('検査の問題と注意（見直し案5・6）', () => {
  it('解放条件に届かない値は注意で、データは読める', () => {
    // ユーザー決定 2026-11-19
    const d = GAME_DATA;
    const odd = { ...d, params: { ...d.params, actions: { ...d.params.actions, unlockTop: { ...d.params.actions.unlockTop, expedition: { metric: 'militaryLevel' as const, atLeast: 99 } } } } };
    expect(checkGameData(odd)).toEqual([]);
    expect(checkGameDataWarnings(odd).map((w) => w.path)).toContain('params.actions.unlockTop.expedition.atLeast');
  });

  it('「トラックが上がった時」の反応にトラックの指定がなければ問題にする', () => {
    // ユーザー決定 2026-11-19（2026-11-16 の指揮官の取りこぼしの再発防止）
    const d = GAME_DATA;
    const script: Script = [{ ability: 'on', event: 'trackRaised', filter: {}, do: [{ op: 'gain', res: 'gold', amount: 1 }] }];
    const bad = { ...d, characters: d.characters.map((c, i) => (i === 0 ? { ...c, script } : c)) };
    expect(checkGameData(bad).map((i) => i.path)).toContain('characters[0].script[0].filter.track');
  });
});

describe('文言を確かめる（見直し案2）', () => {
  it('効果を変えて文言を変えていないカードを挙げ、文言も変えれば挙げない', () => {
    // ユーザー決定 2026-11-19
    const cards = (getAt(base['cards_civilization.json'], ['cards']) as { id: string }[]) ?? [];
    const first = cards[0];
    expect(first).toBeDefined();
    let work = setInFiles(base, 'cards_civilization.json', ['cards', 0, 'script'], []);
    expect(staleTexts(base, work).map((t) => t.id)).toContain(first?.id);
    work = setInFiles(work, 'cards_civilization.json', ['cards', 0, 'text'], '（効果なし）');
    expect(staleTexts(base, work).map((t) => t.id)).not.toContain(first?.id);
  });
});

describe('終了時の換算率（ユーザー決定 2026-11-20）', () => {
  it('N につき M 点で、1につき2点のような率も表せる。端数は切り捨てる', () => {
    // rules.md v0.8 17-2、17-3、17-4 からの変更（ユーザー決定 2026-11-20）
    expect(ratePoints(7, { per: 3, points: 2 })).toBe(4);
    expect(ratePoints(5, { per: 1, points: 2 })).toBe(10);
    expect(ratePoints(3, { per: 2, points: 1 })).toBe(1);
    expect(ratePoints(3, { per: 1, points: 0.5 })).toBe(1);
    expect(ratePoints(9, { per: 1, points: 0 })).toBe(0);
  });

  it('いまのデータの形（per・points の組）を読み、以前の形（数1つ）も同じ率に読む', () => {
    // ユーザー決定 2026-11-20
    const files = setInFiles(base, 'params.json', ['scoring', 'materialsPerPointByWorkshops', 1], { per: 1, points: 2 });
    const d = parseGameData(rawFromFiles(files));
    expect(d.params.scoring.materialsPerPointByWorkshops[1]).toEqual({ per: 1, points: 2 });
    expect(checkGameData(d)).toEqual([]);
  });
});
