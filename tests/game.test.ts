import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { neighborsOf, type CellId } from '../src/game/board.ts';
import { buildingCount, landCount, placeableCells, playerOf, terrainOf, usableRegular, usableTemp } from '../src/game/core.ts';
import { applyMove, createGame, decider, getOptions, isGameOver } from '../src/game/engine.ts';
import { finalScores } from '../src/game/scoring.ts';
import type { GameState, PlayerState } from '../src/game/types.ts';
import { edit, firstTurn, withoutCharacters, ids, me, play, top, untilTurn } from './helpers/game.ts';

const d = GAME_DATA;

/** 最初の手番。ワーカーの組み合わせの選択が挟まらないよう、全員の臨時ワーカーを0にする。 */
const base = (playerCount = 3, seed = 1): GameState =>
  edit(withoutCharacters(firstTurn(playerCount, seed)), (state) => {
    for (const p of state.players) p.tempWorkers = 0;
  });

/** 現在の手番プレイヤーの、地形と土地タイルが一致する配置先を1つ返す。 */
const matchingTile = (s: GameState, p: PlayerState): string => {
  const cell = placeableCells(p)[0];
  if (cell === undefined) throw new Error('配置先がない');
  return `tile:${cell}:${terrainOf(d, p, cell)}`;
};

const mismatchingTile = (s: GameState, p: PlayerState): string => {
  const cell = placeableCells(p)[0];
  if (cell === undefined) throw new Error('配置先がない');
  const terrain = terrainOf(d, p, cell);
  return `tile:${cell}:${terrain === 'plains' ? 'forest' : 'plains'}`;
};

/** 手番のプレイヤーに、建物の建っていない土地を cells の数だけ与える（E1・F1 に加えて）。 */
const giveLand = (s: GameState, p: PlayerState, count: number): CellId[] => {
  const added: CellId[] = [];
  while (added.length < count) {
    const cell = placeableCells(p)[0];
    if (cell === undefined) break;
    p.land[cell] = terrainOf(d, p, cell);
    added.push(cell);
  }
  return added;
};

describe('準備とドラフト（第2章）', () => {
  it('ドラフトは手番順の最後のプレイヤーから逆順に選び、一巡したら再び最後から選ぶ', () => {
    // rules.md v0.8 2-6-3、2-6-7
    let s = createGame({ playerCount: 4 }, 7);
    const expected = [...s.turnOrder].reverse();
    const deciders: number[] = [];
    while (top(s).t === 'draftPick') {
      deciders.push(decider(s) ?? -1);
      s = applyMove(s, ids(s)[0] ?? '');
    }
    expect(deciders).toEqual([...expected, ...expected, ...expected]);
  });

  it('ヴァリアントのスネークドラフトでは、2巡目だけ手番順のとおり（最初から）選ぶ', () => {
    // rules.md v0.8 2-6-7 のヴァリアント（ユーザー決定 2026-11-06：スイーツランドの準備のドラフトに倣う。N…1、1…N、N…1）
    for (const playerCount of [3, 4]) {
      let s = createGame({ playerCount, variants: { snakeDraft: true } }, 11);
      const backward = [...s.turnOrder].reverse();
      const deciders: number[] = [];
      while (top(s).t === 'draftPick') {
        deciders.push(decider(s) ?? -1);
        s = applyMove(s, ids(s)[0] ?? '');
      }
      expect(deciders).toEqual([...backward, ...s.turnOrder, ...backward]);
      // 全員が3種類を1つずつ選び終えている（2-6-4-2）
      for (const p of s.players) expect([p.boardId, p.bonusTile, p.characterId].every((v) => v !== null)).toBe(true);
    }
  });

  it('各プレイヤーはまだ獲得していない種類の要素からのみ選ぶ', () => {
    // rules.md v0.8 2-6-4-2、2-6-5
    let s = createGame({ playerCount: 3 }, 3);
    s = applyMove(s, ids(s).find((id) => id.startsWith('draft:board:')) ?? '');
    s = applyMove(s, ids(s)[0] ?? '');
    s = applyMove(s, ids(s)[0] ?? '');
    // 2巡目：既に個人ボードを持つプレイヤーには個人ボードの候補が出ない。
    expect(ids(s).some((id) => id.startsWith('draft:board:'))).toBe(false);
    s = untilTurn(s);
    for (const p of s.players) {
      expect(p.boardId).not.toBeNull();
      expect(p.characterId).not.toBeNull();
      expect(p.bonusTile).not.toBeNull();
    }
  });

  it('候補は個人ボード5枚・キャラクター10人のすべてと、場のボーナスタイル（人数＋3枚）である', () => {
    // rules.md v0.8 2-6-1、2-6-2（ユーザー決定 2026-11-03）、2-4-2、19-4-5
    for (const n of [3, 4]) {
      const s = createGame({ playerCount: n }, 11);
      expect(s.draftPool.boards).toHaveLength(5);
      expect(s.draftPool.characters).toHaveLength(10);
      expect(s.bonusTilesOnBoard).toHaveLength(n + 3);
      expect(new Set(s.bonusTilesOnBoard).size).toBe(n + 3);
    }
  });

  it('特別な市民カードは人数＋1枚、計画都市カードは人数−1枚を公開し、自然公園カードを1枚ずつ配る', () => {
    // rules.md v0.8 2-3-1、2-3-2、2-3-3、19-4-4
    const s = createGame({ playerCount: 4 }, 5);
    expect(s.scRevealed).toHaveLength(5);
    expect(s.scDeck).toHaveLength(15);
    expect(s.plannedCityRevealed).toHaveLength(3);
    expect(new Set(s.players.map((p) => p.natureParkCard)).size).toBe(4);
  });

  it('襲撃カードは第1ラウンドがカード1で、残りはシャッフルして使う', () => {
    // rules.md v0.8 7-3-1、7-3-2
    const s = createGame({ playerCount: 3 }, 9);
    expect(s.raidOrder[0]).toBe(1);
    expect([...s.raidOrder].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('ドラフトの後、E1・F1 に土地タイルを置き、第1ラウンドの収入を得る', () => {
    // rules.md v0.8 2-1-4、2-7-1、2-2-1、3-2-2
    const s = firstTurn(3, 1);
    for (const p of s.players) {
      expect(p.land.E1).toBe('forest');
      expect(p.land.F1).toBe('forest');
      expect(landCount(p)).toBe(2);
      expect(p.hand.length).toBeGreaterThanOrEqual(3);
      const tileGold = p.bonusTile === 2 ? 8 : p.bonusTile === 6 ? 3 : 0;
      const tileProduction = p.bonusTile === 8 ? 2 : 0;
      expect(p.gold).toBe(20 + tileGold + tileProduction);
    }
  });

  it('対応していないプレイ人数は作れない', () => {
    // rules.md v0.8 1-0-4
    expect(() => createGame({ playerCount: 2 }, 1)).toThrow();
    expect(() => createGame({ playerCount: 5 }, 1)).toThrow();
  });
});

describe('手番とパス（第11章・第12章）', () => {
  it('第1ラウンドは手番順の最初のプレイヤーから手番を行う', () => {
    // rules.md v0.8 12-0-3、12-0-4
    const s = firstTurn(3, 2);
    expect(decider(s)).toBe(s.turnOrder[0]);
  });

  it('ワーカーがなくてもパスは自動で行わず、パスは常に選べる', () => {
    // rules.md v0.8 12-0-7、12-1-1
    const s = edit(base(), (_, p) => {
      p.regularPlaced = p.regularWorkers;
      p.tempWorkers = 0;
    });
    expect(top(s).t).toBe('turn');
    expect(ids(s).filter((id) => id.startsWith('act:'))).toEqual([]);
    expect(ids(s)).toContain('pass');
  });

  it('アクションの後は手番を終えるかフリーアクションのみを選べ、アクションを重ねられない', () => {
    // rules.md v0.8 12-0-6
    let s = edit(base(), (_, p) => {
      p.gold = 30;
    });
    s = play(s, 'act:import:normal', 'count:1');
    expect(ids(s)).toContain('end');
    expect(ids(s).some((id) => id.startsWith('act:'))).toBe(false);
    expect(ids(s)).not.toContain('pass');
  });

  it('次のラウンドの手番順はパスした順である', () => {
    // rules.md v0.8 12-0-5
    let s = firstTurn(3, 4);
    const passOrder: number[] = [];
    while (s.round === 1) {
      if (top(s).t === 'turn') {
        passOrder.push(decider(s) ?? -1);
        s = applyMove(s, 'pass');
      } else {
        s = applyMove(s, ids(s)[0] ?? '');
      }
    }
    expect(s.turnOrder).toEqual(passOrder);
    s = untilTurn(s);
    expect(decider(s)).toBe(passOrder[0]);
  });

  it('パスしたらボーナスタイルを返却し、返却したタイルと他人の占有するタイルは選べない', () => {
    // rules.md v0.8 11-3-1、11-3-2、12-1-2
    let s = firstTurn(3, 1);
    const p = me(s);
    const returned = p.bonusTile;
    s = applyMove(s, 'pass');
    expect(top(s).t).toBe('passTile');
    const held = s.players.filter((q) => q.index !== p.index).map((q) => q.bonusTile);
    const choices = ids(s).map((id) => Number(id.slice('bonus:'.length)));
    expect(choices).not.toContain(returned);
    for (const h of held) expect(choices).not.toContain(h);
    expect(choices.length).toBeGreaterThanOrEqual(3);
  });

  it('パス時得点はパス宣言時点の状態を参照する（ボーナスタイル6：住宅1軒につき1点）', () => {
    // rules.md v0.8 11-2-1、11-2-5、17-0-2
    let s = edit(base(), (_, p) => {
      p.bonusTile = 6;
      p.buildings.E1 = 'house';
      p.buildings.F1 = 'house';
    });
    const before = me(s).score;
    const index = me(s).index;
    s = applyMove(s, 'pass');
    expect(playerOf(s, index).score).toBe(before + 2);
    expect(s.events.filter((e) => e.type === 'score').at(-1)).toMatchObject({ type: 'score', axis: 'other', points: 2 });
  });

  it('パスしたプレイヤーには、そのラウンド中は手番が回らない', () => {
    // rules.md v0.8 12-1-3、12-1-4、10-1-6
    let s = firstTurn(3, 1);
    const passed = decider(s);
    s = untilTurn(applyMove(s, 'pass'));
    for (let i = 0; i < 6 && s.round === 1; i += 1) {
      expect(decider(s)).not.toBe(passed);
      s = untilTurn(applyMove(s, 'pass'));
    }
  });

  it('第5ラウンドのパスではボーナスタイルの返却と選択を行わない', () => {
    // rules.md v0.8 19-4-2
    let s = firstTurn(3, 1);
    s.round = 5;
    const tile = me(s).bonusTile;
    const index = me(s).index;
    s = applyMove(s, 'pass');
    expect(top(s).t).not.toBe('passTile');
    expect(playerOf(s, index).bonusTile).toBe(tile);
  });

  it('ボーナスタイル8の金の生産力の増加は、獲得したラウンドの収入から反映する', () => {
    // rules.md v0.8 3-2-4、11-2-1、11-3-3、12-0-1
    let s = edit(base(), (state, p) => {
      state.bonusTilesOnBoard = [2, 3, 5, 6, 8, 9];
      for (const q of state.players) q.bonusTile = q.index === p.index ? 2 : q.index === (p.index + 1) % 3 ? 3 : 5;
      p.gold = 10;
      p.militaryLevel = 0;
    });
    const index = me(s).index;
    s = play(s, 'pass', 'bonus:8');
    while (s.round === 1) {
      s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    }
    s = untilTurn(s);
    const p = playerOf(s, index);
    expect(p.goldProduction).toBe(22);
    // 第2ラウンドの収入（22金）の後、第1ラウンドの防衛失敗（カード1）で3金を失う。
    expect(p.gold).toBe(10 + 22 - 3);
  });
});

describe('ワーカーとアクションスペース（第3章・第6章）', () => {
  it('通常・上位・最上位はそれぞれ1・2・3ワーカーを使う', () => {
    // rules.md v0.8 6-1-1
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.tempWorkers = 0;
    });
    const before = usableRegular(me(s));
    s = play(s, 'act:import:upper', 'count:1');
    expect(usableRegular(me(s))).toBe(before - 2);
  });

  it('通常ワーカーと臨時ワーカーを混ぜて置くときは、組み合わせを選ぶ', () => {
    // rules.md v0.8 3-4-2、3-4-6
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.tempWorkers = 2;
    });
    s = applyMove(s, 'act:import:upper');
    expect(top(s).t).toBe('payWorkers');
    expect(ids(s)).toEqual(['temp:0', 'temp:1', 'temp:2']);
    s = applyMove(s, 'temp:2');
    expect(me(s).tempWorkers).toBe(0);
    expect(me(s).regularPlaced).toBe(0);
  });

  it('ワーカーが足りないアクションスペースは選べない', () => {
    // rules.md v0.8 6-1-1、16-2-1
    const s = edit(base(), (_, p) => {
      p.gold = 100;
      p.tempWorkers = 0;
      p.regularPlaced = p.regularWorkers - 1;
    });
    expect(ids(s)).toContain('act:import:normal');
    expect(ids(s)).not.toContain('act:import:upper');
  });

  it('占有型のスペースは使ったプレイヤーを含めてそのラウンド中は使えず、共有スペースは何度でも使える', () => {
    // rules.md v0.8 6-2-1、6-2-2
    let s = edit(base(), (state) => {
      for (const p of state.players) {
        p.gold = 100;
        p.materials = 30;
      }
    });
    s = play(s, 'act:import:normal', 'count:1', 'end');
    s = untilTurn(s);
    expect(ids(s)).not.toContain('act:import:normal');
    s = play(s, 'act:pioneer:normal', 'count:1');
    s = applyMove(s, matchingTile(s, me(s)));
    s = untilTurn(applyMove(s, 'end'));
    expect(ids(s)).toContain('act:pioneer:normal');
  });

  it('最上位アクションは解放条件を満たすまで選べず、一度解放したら維持する', () => {
    // rules.md v0.8 6-1-3、6-1-4、6-3-3-3
    let s = edit(base(), (_, p) => {
      p.gold = 100;
    });
    expect(ids(s)).toContain('act:import:upper');
    expect(ids(s)).not.toContain('act:import:top');
    s = edit(s, (_, p) => {
      p.buildings.E1 = 'shop';
      p.buildings.F1 = 'shop';
    });
    expect(ids(s)).toContain('act:import:top');
    s = play(s, 'act:import:top', 'count:1');
    expect(me(s).unlockedTop).toContain('import');
    // 解放後に条件を満たさなくなっても維持する。
    s = edit(s, (_, p) => {
      p.buildings = {};
    });
    s = untilTurn(applyMove(s, 'end'));
    s = edit(s, (state) => {
      state.occupied = [];
    });
    const unlocked = s.players.filter((q) => q.unlockedTop.includes('import'));
    expect(unlocked).toHaveLength(1);
  });

  it('この手番に獲得した臨時ワーカーは、フリーアクションを含めて手番中は使えない', () => {
    // rules.md v0.8 3-4-4、3-4-4-2
    let s = edit(base(), (_, p) => {
      p.tempWorkers = 0;
      p.materials = 10;
    });
    s = play(s, 'act:welfare:upper');
    // 福祉の1人と、インフラレベル2の到達報酬の1人（8-1-2）。
    expect(me(s).tempWorkers).toBe(2);
    expect(usableTemp(me(s))).toBe(0);
    expect(ids(s)).not.toContain('free:tempworker_to_materials');
    s = applyMove(s, 'end');
    expect(s.players.every((p) => p.tempLocked === 0)).toBe(true);
  });

  it('ラウンド開始時（ボーナスタイル5）に得た臨時ワーカーは、最初の手番から使える', () => {
    // rules.md v0.8 3-4-4、3-4-4-2、11-2-1
    let s = edit(base(), (state, p) => {
      state.bonusTilesOnBoard = [5, 2, 3, 6, 7, 8];
      for (const q of state.players) q.bonusTile = q.index === p.index ? 2 : null;
    });
    const index = me(s).index;
    s = play(s, 'pass', 'bonus:5');
    while (s.round === 1) s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    s = untilTurn(s);
    // 第2ラウンドの手番順はパスした順で、最初にパスしたこのプレイヤーが先頭になる。
    expect(decider(s)).toBe(index);
    expect(me(s).tempWorkers).toBe(1);
    expect(me(s).tempLocked).toBe(0);
    expect(usableTemp(me(s))).toBe(1);
  });

  it('移住で得た通常ワーカーは、そのラウンド中は使えない', () => {
    // rules.md v0.8 3-3-3、6-3-8-3
    let s = edit(base(), (_, p) => {
      p.buildings.E1 = 'house';
      p.buildings.F1 = 'house';
    });
    const before = usableRegular(me(s));
    s = play(s, 'act:migration:normal');
    expect(me(s).regularWorkers).toBe(6);
    expect(usableRegular(me(s))).toBe(before - 1);
  });
});

describe('フリーアクション（第10章）', () => {
  it('資源変換はアクションの前後に何度でも行える', () => {
    // rules.md v0.8 10-1-1、10-1-2、10-1-3、10-1-4
    let s = edit(base(), (_, p) => {
      p.gold = 10;
      p.materials = 0;
    });
    s = play(s, 'free:gold_to_materials', 'free:gold_to_materials');
    expect(me(s).gold).toBe(0);
    expect(me(s).materials).toBe(2);
    expect(ids(s)).not.toContain('free:gold_to_materials');
    s = play(s, 'free:materials_to_gold');
    expect(me(s).gold).toBe(1);
  });

  it('文明カード1枚を資材1個に変換するときは、捨てるカードを選ぶ', () => {
    // rules.md v0.8 10-1-3
    let s = firstTurn();
    const card = me(s).hand[0] ?? '';
    const materials = me(s).materials;
    s = applyMove(s, `free:civcard_to_materials:${card}`);
    expect(me(s).hand).not.toContain(card);
    expect(s.civDiscard).toContain(card);
    expect(me(s).materials).toBe(materials + 1);
  });
});

describe('開拓（第4章・6-3-1）', () => {
  it('配置先は開拓済みの土地と辺を共有する未開拓マスに限る', () => {
    // rules.md v0.8 4-2-1
    let s = edit(base(), (_, p) => {
      p.materials = 10;
    });
    s = play(s, 'act:pioneer:normal', 'count:1');
    const cells = new Set(ids(s).map((id) => id.split(':')[1]));
    expect([...cells].sort()).toEqual(['D1', 'E2', 'F2']);
    for (const cell of cells) {
      expect(neighborsOf(cell as CellId).some((n) => n === 'E1' || n === 'F1')).toBe(true);
    }
  });

  it('地形一致は資材2個、不一致は資材3個', () => {
    // rules.md v0.8 4-2-4、4-3-1〜4-3-3
    let s = edit(base(), (_, p) => {
      p.materials = 10;
    });
    s = play(s, 'act:pioneer:normal', 'count:2');
    s = applyMove(s, matchingTile(s, me(s)));
    s = applyMove(s, mismatchingTile(s, me(s)));
    const p = me(s);
    const bonus = s.events.filter((e) => e.type === 'tilePlaced').length; // マスボーナスの資材は別に数える
    expect(bonus).toBeGreaterThan(0);
    const squareMaterials = (['D1', 'D2', 'E2', 'F2', 'C1', 'C2', 'D3', 'E3', 'F3'] as CellId[])
      .filter((c) => p.land[c] !== undefined)
      .map((c) => d.boards.find((b) => b.id === p.boardId)?.squares[c]?.bonus)
      .filter((b) => b?.kind === 'materials')
      .reduce((sum, b) => sum + (b?.amount ?? 0), 0);
    expect(p.materials).toBe(10 - 5 + squareMaterials);
  });

  it('上位の開拓は合計資材コストを1軽減し、割引は不一致の追加分にも適用し、0未満にならない', () => {
    // rules.md v0.8 4-3-4、4-3-5、19-1-2
    let s = edit(base(), (_, p) => {
      p.materials = 2;
    });
    // 上位で1枚：2−1＝1資材。不一致でも3−1＝2資材で払える。
    s = play(s, 'act:pioneer:upper', 'count:1');
    expect(ids(s).length).toBeGreaterThan(placeableCells(me(s)).length);
  });

  it('配置する枚数は先に決め、払えない枚数は選べない', () => {
    // rules.md v0.8 4-4-1-2、6-1-7
    let s = edit(base(), (_, p) => {
      p.materials = 3;
    });
    s = applyMove(s, 'act:pioneer:normal');
    expect(ids(s)).toEqual(['count:1']);
    s = applyMove(s, 'count:1');
    // 残りの資材で払えない不一致の配置は選べない。
    s = edit(s, (_, p) => {
      p.materials = 2;
    });
    expect(ids(s).every((id) => {
      const [, cell, tile] = id.split(':');
      return terrainOf(d, me(s), cell as CellId) === tile;
    })).toBe(true);
  });

  it('マスボーナスはその土地に土地タイルを置いたときに得る', () => {
    // rules.md v0.8 4-4-4、4-4-4-2
    const s0 = firstTurn();
    const p0 = me(s0);
    const board = d.boards.find((b) => b.id === p0.boardId);
    const target = (['D1', 'D2', 'E2', 'F2'] as CellId[]).find((c) => board?.squares[c]?.bonus?.kind === 'gold');
    if (target === undefined) return; // このボードには該当マスがない
    let s = edit(s0, (_, p) => {
      p.materials = 10;
    });
    const gold = me(s).gold;
    s = play(s, 'act:pioneer:normal', 'count:1', `tile:${target}:${terrainOf(d, me(s), target)}`);
    expect(me(s).gold).toBe(gold + 2);
  });
});

describe('建設（第5章・6-3-2）', () => {
  it('住宅は2金2資材、その他は5金3資材。上位の建築は合計で1金1資材を軽減する', () => {
    // rules.md v0.8 5-3-1、6-3-2-1
    let s = edit(base(), (_, p) => {
      p.gold = 20;
      p.materials = 20;
    });
    s = play(s, 'act:build:upper', 'build:house:E1', 'build:shop:F1');
    expect(me(s).gold).toBe(20 - 7 + 1 + 0);
    expect(me(s).materials).toBe(20 - 5 + 1);
  });

  it('建てられる土地の数を超える軒数は選べず、建物の上限を超えられない', () => {
    // rules.md v0.8 5-2-1、6-3-2-2、19-1-4
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.materials = 100;
      p.buildings.E1 = 'shop';
    });
    s = play(s, 'act:build:normal');
    // 空き地は F1 の1か所だけ。
    expect(ids(s).every((id) => id === 'done' || id.endsWith(':F1'))).toBe(true);
    s = edit(s, (_, p) => {
      p.buildings.D1 = 'shop';
      p.buildings.C1 = 'shop';
    });
    expect(ids(s)).not.toContain('build:shop:F1');
  });

  it('飯場の周囲のマスへの建設は資材1個軽減し、同じ処理で建てた飯場は後続に影響しない', () => {
    // rules.md v0.8 5-5-7-2、5-5-7-3、5-6-4、5-6-5
    let s = edit(base(), (state, p) => {
      p.gold = 100;
      p.materials = 100;
      giveLand(state, p, 2);
    });
    const cells = Object.keys(me(s).land) as CellId[];
    s = edit(s, (_, p) => {
      p.buildings.E1 = 'camp';
    });
    const neighbor = cells.find((c) => c !== 'E1' && neighborsOf('E1').includes(c)) as CellId;
    const materials = me(s).materials;
    s = play(s, 'act:build:normal', `build:house:${neighbor}`, 'done');
    expect(me(s).materials).toBe(materials - 1);
  });

  it('建設時効果と地形ボーナス：商店は金の生産力+2、平原の大学は3点', () => {
    // rules.md v0.8 5-4-1、5-5-1-1、5-5-5-1、4-1-3-2
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.materials = 100;
      p.land.E1 = 'plains';
    });
    const production = me(s).goldProduction;
    const score = me(s).score;
    const hand = me(s).hand.length;
    s = play(s, 'act:build:normal', 'build:university:E1', 'build:shop:F1');
    expect(me(s).goldProduction).toBe(production + 2);
    expect(me(s).score).toBe(score + 3);
    expect(me(s).hand.length).toBe(hand + 2);
  });

  it('砦の建設で軍事レベルが上がり、到達報酬を得る', () => {
    // rules.md v0.8 5-5-3-1、7-1-2、7-1-4
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.materials = 100;
      p.militaryLevel = 2;
    });
    s = play(s, 'act:build:normal', 'build:fort:E1', 'done');
    expect(me(s).militaryLevel).toBe(3);
    expect(me(s).militaryTokens).toBe(2);
    expect(me(s).militaryRewardsClaimed).toEqual([3]);
  });

  it('飯場の建設で土地タイル1枚を地形一致で置き、資材は払わない', () => {
    // rules.md v0.8 5-5-7-1、4-2-2、19-1-1
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.materials = 3;
    });
    s = play(s, 'act:build:normal', 'build:camp:E1');
    expect(top(s).t).toBe('placeTiles');
    expect(ids(s).every((id) => {
      const [, cell, tile] = id.split(':');
      return terrainOf(d, me(s), cell as CellId) === tile;
    })).toBe(true);
    s = applyMove(s, ids(s)[0] ?? '');
    expect(landCount(me(s))).toBe(3);
    expect(me(s).materials).toBeGreaterThanOrEqual(0);
  });
});

describe('輸入・輸出・教練（6-3-3〜6-3-5）', () => {
  it('輸入の上位は7金→2資材で、1回以上交換すると2資材を追加で得る。0回は選べない', () => {
    // rules.md v0.8 6-3-3-2、6-1-6-2、19-2-1
    let s = edit(base(), (_, p) => {
      p.gold = 14;
      p.materials = 0;
    });
    s = applyMove(s, 'act:import:upper');
    expect(ids(s)).toEqual(['count:1', 'count:2']);
    s = applyMove(s, 'count:2');
    expect(me(s).gold).toBe(0);
    expect(me(s).materials).toBe(6);
  });

  it('輸入の後、商店の数に応じて金の生産力が増える', () => {
    // rules.md v0.8 5-5-1-2、19-2-2
    let s = edit(base(), (_, p) => {
      p.gold = 10;
      p.buildings.E1 = 'shop';
      p.buildings.F1 = 'shop';
    });
    const production = me(s).goldProduction;
    s = play(s, 'act:import:normal', 'count:1');
    expect(me(s).goldProduction).toBe(production + 2);
  });

  it('輸出の後、工房の数に応じて金を得る', () => {
    // rules.md v0.8 6-3-4-2、5-5-2-2
    let s = edit(base(), (_, p) => {
      p.gold = 0;
      p.materials = 3;
      p.buildings.E1 = 'workshop';
    });
    s = play(s, 'act:export:normal', 'count:3');
    expect(me(s).gold).toBe(15 + 2);
  });

  it('教練は金を払ってトークンを得て、砦の数に応じたトークンで上昇処理を0回から上限回数まで行う', () => {
    // rules.md v0.8 6-3-5-2、6-3-5-4、5-5-3-2、19-2-3
    let s = edit(base(), (_, p) => {
      p.gold = 6;
      p.militaryTokens = 0;
      p.militaryLevel = 0;
    });
    s = applyMove(s, 'act:drill:upper');
    // 5個のトークン、砦0軒なら1回4個。上限2回だが1回まで。
    expect(ids(s)).toEqual(['count:0', 'count:1']);
    s = applyMove(s, 'count:1');
    expect(me(s).militaryLevel).toBe(1);
    expect(me(s).militaryTokens).toBe(1);
  });

  it('軍事レベル12を超える上昇処理は1回につき2点（軍事・防衛）', () => {
    // rules.md v0.8 6-3-5-5、6-3-5-6、7-1-5、17-6-2-2
    let s = edit(base(), (_, p) => {
      p.gold = 3;
      p.militaryLevel = 12;
      p.militaryRewardsClaimed = [3, 6, 9, 12];
      p.militaryTokens = 4;
    });
    const score = me(s).score;
    s = play(s, 'act:drill:normal', 'count:1');
    expect(me(s).militaryLevel).toBe(12);
    expect(me(s).score).toBe(score + 2);
    expect(s.events.filter((e) => e.type === 'score').at(-1)).toMatchObject({ axis: 'military' });
  });
});

describe('遠征（6-3-6）', () => {
  it('選んだ報酬の最も高いレベルと軍事レベルの差分だけトークンを使い、払えない報酬は選べない', () => {
    // rules.md v0.8 6-3-6-3、6-3-6-4、19-2-4
    let s = edit(base(), (_, p) => {
      p.militaryLevel = 1;
      p.militaryTokens = 3;
      p.gold = 0;
    });
    s = applyMove(s, 'act:expedition:normal');
    // 報酬の添字：0=Lv0、1=Lv1、2=Lv4、3=Lv7、4=Lv10。
    expect(ids(s)).toEqual(['reward:0', 'reward:1', 'reward:2']);
    s = play(s, 'reward:2', 'reward:0');
    expect(me(s).militaryTokens).toBe(0);
    expect(me(s).gold).toBe(2);
    expect(top(s).t).toBe('placeTiles');
  });

  it('通常は異なる報酬を2種類まで、最上位は合計5個まで・同じ報酬は2回まで', () => {
    // rules.md v0.8 6-3-6-6（最上位は5個まで：ユーザー決定 2026-11-03）
    let s = edit(base(), (_, p) => {
      p.militaryLevel = 5;
      p.militaryTokens = 0;
      p.gold = 0;
      p.materials = 0;
    });
    s = play(s, 'act:expedition:normal', 'reward:0');
    expect(ids(s)).not.toContain('reward:0');
    s = applyMove(s, 'reward:1');
    // 2種類で上限のため自動で確定する。
    expect(top(s).t).not.toBe('expeditionPick');
    expect(me(s).gold).toBe(2);
    expect(me(s).materials).toBe(1);

    let t = edit(base(), (_, p) => {
      p.militaryLevel = 5;
      p.militaryTokens = 0;
      p.gold = 0;
      p.materials = 0;
    });
    t = play(t, 'act:expedition:top', 'reward:0', 'reward:0');
    expect(ids(t)).not.toContain('reward:0');
    t = play(t, 'reward:1', 'done');
    expect(me(t).gold).toBe(4);
    expect(me(t).materials).toBe(1);
  });

  it('遠征の得点は軍事・防衛に含める', () => {
    // rules.md v0.8 6-3-6-2、17-6-2
    let s = edit(base(), (_, p) => {
      p.militaryLevel = 10;
      p.militaryTokens = 0;
    });
    s = play(s, 'act:expedition:normal', 'reward:4', 'done');
    expect(s.events.filter((e) => e.type === 'score').at(-1)).toMatchObject({ points: 2, axis: 'military' });
  });
});

describe('福祉・移住・研究・普及（6-3-7〜6-3-10）', () => {
  it('福祉はインフラレベルを上げ、到達報酬で特別な市民カードを公開カードから選んで補充する', () => {
    // rules.md v0.8 6-3-7-1、8-1-2、9-3-2、9-3-2-2
    let s = edit(base(), (_, p) => {
      p.materials = 5;
      p.infraLevel = 2;
      p.infraRewardsClaimed = [2];
    });
    const revealed = [...s.scRevealed];
    const deckTop = s.scDeck[0];
    s = applyMove(s, 'act:welfare:upper');
    expect(me(s).infraLevel).toBe(4);
    expect(top(s).t).toBe('chooseSpecialCitizen');
    const card = revealed[0] ?? '';
    s = applyMove(s, `sc:${card}`);
    expect(me(s).specialCitizens).toEqual([card]);
    expect(s.scRevealed).toHaveLength(revealed.length);
    expect(s.scRevealed).toContain(deckTop);
  });

  it('インフラレベル12を超える上昇は破棄する', () => {
    // rules.md v0.8 8-1-1、19-2-9
    let s = edit(base(), (_, p) => {
      p.materials = 8;
      p.infraLevel = 11;
      p.infraRewardsClaimed = [2, 4, 6, 8, 10];
      p.tempWorkers = 0;
      p.unlockedTop = ['welfare'];
    });
    s = applyMove(s, 'act:welfare:top');
    while (top(s).t !== 'turn') s = applyMove(s, ids(s)[0] ?? '');
    expect(me(s).infraLevel).toBe(12);
  });

  it('福祉の後、役所があれば臨時ワーカー1人を資材に変換できる。同じ福祉で得た臨時ワーカーは使えない', () => {
    // rules.md v0.8 5-5-4-2、19-2-7（ユーザー決定 2026-11-03）
    let s = edit(base(), (_, p) => {
      p.materials = 5;
      p.tempWorkers = 0;
      p.infraRewardsClaimed = [2];
      p.buildings.E1 = 'office';
    });
    s = applyMove(s, 'act:welfare:upper');
    expect(top(s).t).toBe('turn');
    let t = edit(base(), (_, p) => {
      p.materials = 5;
      p.tempWorkers = 1;
      p.regularPlaced = 0;
      p.infraRewardsClaimed = [2];
      p.buildings.E1 = 'office';
    });
    t = play(t, 'act:welfare:upper', 'temp:0');
    expect(ids(t)).toEqual(['convert:0', 'convert:1']);
    t = applyMove(t, 'convert:1');
    expect(me(t).tempWorkers).toBe(1);
    expect(me(t).materials).toBe(2);
  });

  it('通常ワーカーの上限は5＋住宅数÷2で、上限のときの通常の移住は選べない', () => {
    // rules.md v0.8 3-3-1-2、3-3-4、6-1-6（ユーザー決定 2026-11-03）
    let s = edit(base(), (_, p) => {
      p.regularWorkers = 5;
    });
    expect(ids(s)).not.toContain('act:migration:normal');
    s = edit(s, (_, p) => {
      p.buildings.E1 = 'house';
      p.buildings.F1 = 'house';
    });
    expect(ids(s)).toContain('act:migration:normal');
  });

  it('上位の移住は臨時ワーカー1人と、通常ワーカーを上限までの範囲で最大2人', () => {
    // rules.md v0.8 6-3-8-2、6-1-6、3-3-4
    let s = edit(base(), (_, p) => {
      p.regularWorkers = 5;
      p.tempWorkers = 0;
      p.buildings.E1 = 'house';
      p.buildings.F1 = 'house';
    });
    s = applyMove(s, 'act:migration:upper');
    expect(ids(s)).toEqual(['count:0', 'count:1']);
    s = applyMove(s, 'count:1');
    expect(me(s).regularWorkers).toBe(6);
    expect(me(s).tempWorkers).toBe(1);
  });

  it('研究は引いたカードを含む手札全体から捨てる', () => {
    // rules.md v0.8 6-3-9-2、19-2-8
    let s = firstTurn();
    const hand = me(s).hand.length;
    s = applyMove(s, 'act:research:upper');
    if (top(s).t === 'payWorkers') s = applyMove(s, 'temp:0');
    expect(top(s).t).toBe('discard');
    expect(ids(s)).toHaveLength(new Set(me(s).hand).size);
    s = applyMove(s, ids(s)[0] ?? '');
    expect(me(s).hand.length).toBe(hand + 3 - 1);
  });

  it('山札と捨て札が尽きたら、引けなかった1枚につき資材1個を得る', () => {
    // rules.md v0.8 9-1-5、9-1-6
    let s = edit(base(), (state, p) => {
      state.civDeck = state.civDeck.slice(0, 1);
      state.civDiscard = [];
      p.tempWorkers = 0;
    });
    const materials = me(s).materials;
    s = applyMove(s, 'act:research:normal');
    expect(me(s).materials).toBe(materials + 1);
  });

  it('普及は大学1軒につき1金軽減してプレイし、上位は1枚ごとに1金を即時に得る', () => {
    // rules.md v0.8 9-2-4、5-5-5-2、6-3-10-2（1枚ごとに即時：ユーザー決定 2026-11-03）
    let s = edit(base(), (_, p) => {
      p.hand = ['016', '010'];
      p.gold = 9;
      p.tempWorkers = 0;
      p.buildings.E1 = 'university';
    });
    s = applyMove(s, 'act:spread:upper');
    // 016 は6金→5金、010 は5金→4金。
    s = applyMove(s, 'card:016');
    expect(me(s).gold).toBe(9 - 5 + 1);
    expect(ids(s)).toEqual(['card:010', 'done']);
    s = applyMove(s, 'card:010');
    expect(me(s).gold).toBe(5 - 4 + 1);
    expect(me(s).played).toEqual(['016', '010']);
    expect(top(s).t).toBe('turn');
  });

  it('通常の普及はちょうど1枚をプレイし、払えるカードがなければ選べない', () => {
    // rules.md v0.8 6-3-10-2、16-2-1
    let s = edit(base(), (_, p) => {
      p.hand = ['001'];
      p.gold = 10;
    });
    expect(ids(s)).not.toContain('act:spread:normal');
    s = edit(s, (_, p) => {
      p.gold = 11;
    });
    s = play(s, 'act:spread:normal');
    expect(ids(s)).toEqual(['card:001']);
  });
});

describe('襲撃（7-3〜7-6、19-3）', () => {
  /** 全員をパスさせ、最初の襲撃の宣言まで進める。 */
  const toRaid = (state: GameState): GameState => {
    let s = state;
    while (top(s).t !== 'raidDeclare') {
      s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    }
    return s;
  };

  it('宣言できる目標は不足分のトークンを払えるものに限り、宣言しないことも選べる', () => {
    // rules.md v0.8 7-4-3、7-4-4、19-3-2
    let s = toRaid(firstTurn());
    s = edit(s, (_, p) => {
      p.militaryLevel = 0;
      p.militaryTokens = 1;
    });
    expect(s.defenseLine).toBe(1);
    expect(s.repelLine).toBe(3);
    expect(ids(s)).toEqual(['raid:none', 'raid:defense']);
  });

  it('防衛失敗はラウンド数×−1点、撃退成功はラウンド数×2点にカードの固有効果を加える', () => {
    // rules.md v0.8 7-4-5、7-5-1、7-6-1、19-3-1、19-3-3
    let s = toRaid(firstTurn());
    s = edit(s, (_, p) => {
      p.militaryLevel = 0;
      p.militaryTokens = 3;
    });
    const index = me(s).index;
    const score = me(s).score;
    s = applyMove(s, 'raid:repel');
    const p = playerOf(s, index);
    expect(p.militaryTokens).toBe(0);
    expect(p.score).toBe(score + 2);
    // カード1の撃退成功：土地タイル1枚を即時配置する。
    expect(top(s)).toMatchObject({ t: 'placeTiles', player: index, mode: 'effect' });

    let t = toRaid(firstTurn());
    t = edit(t, (_, q) => {
      q.militaryLevel = 0;
      q.militaryTokens = 0;
      q.gold = 1;
    });
    const loser = me(t).index;
    const loserScore = me(t).score;
    t = applyMove(t, 'raid:none');
    expect(playerOf(t, loser).score).toBe(loserScore - 1);
    // カード1の防衛失敗：次の収入後に3金を失う。
    expect(playerOf(t, loser).pendingLosses).toEqual([{ kind: 'gold', amount: 3 }]);
  });

  it('防衛ライン以上・撃退ライン未満は防衛成功で、得点の変化はない', () => {
    // rules.md v0.8 7-4-5、7-5-1
    let s = toRaid(firstTurn());
    s = edit(s, (_, p) => {
      p.militaryLevel = 1;
      p.militaryTokens = 0;
    });
    const score = me(s).score;
    const index = me(s).index;
    s = applyMove(s, 'raid:none');
    expect(playerOf(s, index).score).toBe(score);
    expect(s.events.filter((e) => e.type === 'raid').at(-1)).toMatchObject({ result: 'defended' });
  });

  it('次の収入後の損失は、次のラウンドの収入の後に適用し、足りなければ0にする', () => {
    // rules.md v0.8 7-6-1、19-3-4
    let s = toRaid(firstTurn());
    const loser = me(s).index;
    s = edit(s, (state) => {
      for (const p of state.players) {
        p.militaryLevel = 0;
        p.militaryTokens = 0;
        p.goldProduction = p.index === loser ? 1 : p.goldProduction;
        p.gold = 0;
      }
    });
    s = applyMove(s, 'raid:none');
    while (s.round === 1) s = applyMove(s, ids(s)[0] ?? '');
    s = untilTurn(s);
    const p = playerOf(s, loser);
    expect(p.pendingLosses).toEqual([]);
    // 収入1金のあと3金を失い、0で止まる（ボーナスタイルの金は除く）。
    const tileGold = p.bonusTile === 2 ? 8 : p.bonusTile === 6 ? 3 : 0;
    expect(p.gold).toBe(Math.max(0, tileGold + 1 - 3));
  });

  it('カード5の得点は合算後の数値であり、基本得点を加えない', () => {
    // rules.md v0.8 7-5-2、19-3-3
    let s = toRaid(firstTurn());
    s = edit(s, (state, p) => {
      state.raidOrder = [5, 1, 2, 3, 4];
      p.militaryLevel = 0;
      p.militaryTokens = 0;
    });
    const score = me(s).score;
    const index = me(s).index;
    s = applyMove(s, 'raid:none');
    expect(playerOf(s, index).score).toBe(score - 3);
  });
});

describe('ゲーム終了と得点計算（第17章）', () => {
  /** 全員がパスを続けて終局させる。 */
  const passToEnd = (state: GameState): GameState => {
    let s = state;
    while (!isGameOver(s)) {
      s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    }
    return s;
  };

  it('5ラウンドで終わり、最終収入を得る', () => {
    // rules.md v0.8 1-0-6、3-2-5、12-2-1、17-0-1
    const s = passToEnd(firstTurn());
    expect(isGameOver(s)).toBe(true);
    expect(s.round).toBe(5);
    expect(getOptions(s)).toEqual([]);
    expect(s.events.filter((e) => e.type === 'round')).toHaveLength(5);
  });

  it('基礎得点・経済・文化・生活の計算と内訳の合計', () => {
    // rules.md v0.8 17-1-3、17-2-2、17-2-3、17-3-1、17-4-1、17-0-3
    const s = structuredClone(passToEnd(firstTurn()));
    const p = playerOf(s, 0);
    p.gold = 23;
    p.materials = 11;
    p.regularWorkers = 7;
    p.played = ['001', '002', '003', '004', '005'];
    p.buildings = { E1: 'shop', F1: 'office' };
    const score = finalScores(s).find((f) => f.player === 0);
    expect(score?.base).toBe(Math.floor(landCount(p) / 2) + 1 + 3);
    const inGame = s.events.filter((e) => e.type === 'score' && e.player === 0);
    const sumOf = (axis: string) => inGame.filter((e) => e.type === 'score' && e.axis === axis).reduce((a, e) => a + (e.type === 'score' ? e.points : 0), 0);
    expect(score?.axes.economy).toBe(2 + 1 + sumOf('economy'));
    expect(score?.leftoverGold).toBe(3);
    expect(score?.axes.culture).toBe(5 + 1 + sumOf('culture'));
    expect(score?.axes.welfare).toBe(2 + sumOf('welfare'));
    const axesSum = Object.values(score?.axes ?? {}).reduce((a, b) => a + b, 0);
    expect(score?.total).toBe((score?.base ?? 0) + axesSum);
    expect(buildingCount(p)).toBe(2);
  });

  it('同点は残った金、基礎得点の順に比べ、それでも同じなら同順位', () => {
    // rules.md v0.8 17-7-1、17-7-2
    const s = structuredClone(passToEnd(firstTurn()));
    s.events = s.events.filter((e) => e.type !== 'score');
    for (const p of s.players) {
      p.gold = 0;
      p.materials = 0;
      p.played = [];
      p.buildings = {};
      p.regularWorkers = 5;
      p.land = { E1: 'forest', F1: 'forest' };
      // 自然公園の得点が混ざらないようにする（配られるカードはシードと山札の枚数で変わる）。
      p.natureParkCard = null;
    }
    expect(new Set(finalScores(s).map((f) => f.rank))).toEqual(new Set([1]));
    const p1 = playerOf(s, 1);
    p1.gold = 19;
    let scores = finalScores(s);
    expect(scores.find((f) => f.player === 1)?.rank).toBe(1);
    expect(scores.find((f) => f.player === 0)?.rank).toBe(2);
    // 合計が同じで残った金も同じ（0金）なら、基礎得点の高いほうが上位。
    p1.gold = 0;
    playerOf(s, 2).land = { E1: 'forest', F1: 'forest', D1: 'forest', D2: 'forest' };
    playerOf(s, 0).gold = 20;
    scores = finalScores(s);
    expect(scores.find((f) => f.player === 2)?.total).toBe(scores.find((f) => f.player === 0)?.total);
    expect(scores.find((f) => f.player === 0)?.leftoverGold).toBe(0);
    expect(scores.find((f) => f.player === 2)?.rank).toBe(1);
    expect(scores.find((f) => f.player === 0)?.rank).toBe(2);
    expect(scores.find((f) => f.player === 1)?.rank).toBe(3);
  });
});

describe('状態の直列化', () => {
  it('GameState は JSON で往復しても同じ選択肢と結果になる', () => {
    // 指示書 3-2（GameState は JSON で直列化できる形に保つ）
    const s = firstTurn(4, 3);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(copy).toEqual(s);
    expect(getOptions(copy)).toEqual(getOptions(s));
    const move = ids(s).find((id) => id.startsWith('act:')) ?? 'pass';
    expect(applyMove(copy, move)).toEqual(applyMove(s, move));
  });
});
