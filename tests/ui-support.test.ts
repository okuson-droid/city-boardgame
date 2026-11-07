import { describe, expect, it } from 'vitest';
import { applyMove, createGame, getOptions, isGameOver } from '../src/game/engine.ts';
import { explain, explainUndo } from '../src/game/explain.ts';
import { describeActionSpace, pendingBuildCost, sceneOf } from '../src/game/queries.ts';
import { ACTIONS, TIERS } from '../src/data/types.ts';
import { createRng, nextInt } from '../src/game/rng.ts';
import { targetOf } from '../src/game/targets.ts';
import { ICON_KEYS } from '../src/data/index.ts';
import { standaloneLabel } from '../src/ui/Icon.tsx';
import { edit, firstTurn, ids, me, play, top, withoutCharacters } from './helpers/game.ts';

const base = () =>
  edit(withoutCharacters(firstTurn()), (state) => {
    for (const p of state.players) p.tempWorkers = 0;
  });

describe('targetOf（ui_design.md 0-2）', () => {
  it('乱択プレイアウトの全局面で、すべての選択肢に画面要素がある（安全網に落ちる合法手が0件）', () => {
    // 指示書 3-4（安全網に落ちた合法手が0件）
    for (const [players, seed] of [
      [3, 11],
      [4, 12],
      [3, 13],
      [4, 14],
    ] as const) {
      let state = createGame({ playerCount: players }, seed);
      let rng = createRng(seed);
      for (let step = 0; step < 3000 && !isGameOver(state); step += 1) {
        const options = getOptions(state);
        const missing = options.filter((o) => targetOf(o) === null).map((o) => o.id);
        expect(missing, `seed ${seed} ${step}手目`).toEqual([]);
        const [i, next] = nextInt(rng, options.length);
        rng = next;
        const option = options[i];
        if (option === undefined) break;
        state = applyMove(state, option.id);
      }
    }
  });

  it('マス・建物・土地タイルの種類は、マスと選び分けの値に分ける', () => {
    // ui_design.md 2-3（マスをタップした後に種類を選ぶ）
    expect(targetOf({ id: 'tile:E2:forest', player: 0, label: '' })).toEqual({
      kind: 'cell',
      cell: 'E2',
      variantKind: 'terrain',
      variant: 'forest',
    });
    expect(targetOf({ id: 'build:house:E1', player: 0, label: '' })).toEqual({
      kind: 'cell',
      cell: 'E1',
      variantKind: 'building',
      variant: 'house',
    });
    expect(targetOf({ id: 'unknown:x', player: 0, label: '' })).toBeNull();
  });
});

describe('explain（選べない理由、ui_design.md 3-2）', () => {
  it('使用済みのスペース・未解放の最上位・ワーカー不足を説明する', () => {
    // rules.md v0.8 6-2-1、6-1-4、6-1-1
    const s = edit(base(), (state, p) => {
      state.occupied = ['import.normal'];
      p.gold = 100;
      p.regularPlaced = p.regularWorkers - 1;
    });
    expect(explain(s, { kind: 'actionSpace', action: 'import', tier: 'normal' })).toContain('使用済み');
    expect(explain(s, { kind: 'actionSpace', action: 'import', tier: 'top' })).toContain('解放条件：商店2軒');
    expect(explain(s, { kind: 'actionSpace', action: 'export', tier: 'upper' })).toContain('ワーカーが足りない');
    expect(explain(s, { kind: 'actionSpace', action: 'export', tier: 'normal' })).toBeNull();
  });

  it('配置できないマスの理由を説明する', () => {
    // rules.md v0.8 4-2-1
    let s = edit(base(), (_, p) => {
      p.materials = 10;
    });
    s = play(s, 'act:pioneer:normal', 'count:1');
    expect(explain(s, { kind: 'cell', cell: 'A1', variantKind: null, variant: null }, me(s).index)).toContain('辺を共有していない');
    expect(explain(s, { kind: 'cell', cell: 'E1', variantKind: null, variant: null }, me(s).index)).toContain('開拓済み');
    expect(explain(s, { kind: 'cell', cell: 'E2', variantKind: null, variant: null }, me(s).index)).toBeNull();
  });

  it('手札のカードは金が足りない理由を説明する', () => {
    // rules.md v0.8 9-2-4
    let s = edit(base(), (_, p) => {
      p.hand = ['016', '001'];
      p.gold = 6;
    });
    s = applyMove(s, 'act:spread:normal');
    expect(explain(s, { kind: 'handCard', card: '001' })).toContain('金が足りない');
    expect(explain(s, { kind: 'handCard', card: '016' })).toBeNull();
  });

  it('取り消しはチェックポイントの後では理由を返す', () => {
    // rules.md v0.8 15-1-2、19-6-3
    const s = firstTurn();
    expect(explainUndo(s)).toContain('戻れない');
    const t = applyMove(s, ids(s).find((id) => id.startsWith('act:import')) ?? '');
    expect(explainUndo(t)).toBeNull();
  });
});

describe('queries（画面のための派生値）', () => {
  it('場面の見出しは10字程度である', () => {
    // ui_design.md 3-1、7-2 U1
    let state = createGame({ playerCount: 3 }, 5);
    const headings = new Set<string>();
    for (let step = 0; step < 400 && !isGameOver(state); step += 1) {
      headings.add(sceneOf(state).heading);
      state = applyMove(state, ids(state)[0] ?? '');
    }
    for (const heading of headings) expect(heading.length).toBeLessThanOrEqual(10);
    expect(headings.size).toBeGreaterThan(3);
  });

  it('アクションスペースの効果文は、30スペースすべてで params.json の数値から組み立てる', () => {
    // rules.md v0.8 6-3（各アクションの段階ごとの効果）
    for (const action of ACTIONS) for (const tier of TIERS) expect(describeActionSpace(action, tier).length).toBeGreaterThan(5);
    expect(describeActionSpace('import', 'normal')).toBe('金3を払って資材1を得る交換を、最大3回行う。');
    expect(describeActionSpace('research', 'top')).toBe('文明カードを3枚引く。その後、文明カードを1枚まで通常のコストでプレイしてよい。');
    expect(describeActionSpace('drill', 'top')).toBe(
      '次のいずれか1つを行う：金3を払って軍事力トークン3を得る／金6を払って軍事力トークン5を得る／金9を払って軍事力トークン8を得る。続けて軍事力トークンを払い、軍事レベルを最大3上げる。',
    );
  });

  it('建設の選択中はコストの見込み（割引・軽減を含む）を返す', () => {
    // rules.md v0.8 5-6-1、6-3-2-1
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.materials = 100;
      p.unlockedTop = [];
    });
    s = play(s, 'act:build:upper', 'build:house:E1');
    expect(top(s).t).toBe('build');
    expect(pendingBuildCost(s)).toEqual({ gold: 1, materials: 1 });
  });
});

describe('増減の出来事（ui_design.md 0-2、4-1）', () => {
  it('選択1つの処理の増減を、プレイヤーごとに1つの出来事として記録する', () => {
    // ui_design.md 4-1（同じ資源ごとに合算して1回だけ見せる）、rules.md v0.8 6-3-3-2（数値はユーザー決定 2026-11-07）
    let s = edit(withoutCharacters(firstTurn()), (state, p) => {
      for (const q of state.players) q.tempWorkers = 0;
      p.gold = 7;
      p.materials = 0;
    });
    const index = me(s).index;
    s = play(s, 'act:import:upper', 'count:1');
    const deltas = s.events.filter((e) => e.type === 'delta' && e.player === index && e.cause === 'move');
    expect(deltas.at(-1)).toMatchObject({ changes: { gold: -3, materials: 2 } });
  });

  it('ラウンド開始時の収入は、自動の処理（income）の出来事として記録する', () => {
    // rules.md v0.8 12-0-1、ui_design.md 4-3
    let s = firstTurn();
    while (s.round === 1) s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    const incomes = s.events.filter((e) => e.type === 'delta' && e.cause === 'income');
    expect(incomes.length).toBeGreaterThanOrEqual(3);
    for (const e of incomes) {
      if (e.type === 'delta') expect(e.changes['gold'] ?? 0).not.toBe(0);
    }
  });
});

describe('単独で出すときのアイコンの名前（ユーザー決定 2026-11-05）', () => {
  it('アイコンの一覧と吹き出しに出す名前は、助詞から始まらない', () => {
    // ui_design.md 2-1（補足表示）、docs/styleguide-icons.md 4-7
    const fragments: string[] = [];
    for (const table of Object.values(ICON_KEYS)) {
      if (typeof table !== 'object' || table === null) continue;
      for (const entry of Object.values(table as Record<string, { icon: string; label: string }>)) {
        const shown = standaloneLabel(entry.icon, entry.label);
        if (/^[のにをがへとし]/.test(shown)) fragments.push(`${entry.icon}：${shown}`);
      }
    }
    expect(fragments).toEqual([]);
    expect(standaloneLabel('met.buildingsOfType', 'の数')).toBe('（建物）の数');
    // 効果の文章を組み立てる語（対応表）は変えない。
    expect(ICON_KEYS.metrics.buildingsOfType?.label).toBe('の数');
  });
});
