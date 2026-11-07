import { describe, expect, it } from 'vitest';
import { applyMove } from '../src/game/engine.ts';
import { replay, undoLast } from '../src/game/history.ts';
import { edit, firstTurn, ids, me, play, top } from './helpers/game.ts';

const base = () =>
  edit(firstTurn(), (state) => {
    for (const p of state.players) {
      p.tempWorkers = 0;
      p.gold = 30;
      p.materials = 10;
    }
  });

describe('巻き戻し（第15章、19-6-3）', () => {
  it('同じ設定・シード・選択の列からは同じ状態が再生される', () => {
    // rules.md v0.8 15-1-3（巻き戻しは変化をすべて元に戻す）、指示書 3-2（シード付き乱数）
    let s = firstTurn(4, 21);
    const moves = s.log.map((entry) => entry.move);
    expect(replay(s.config, s.seed, moves)).toEqual(s);
    s = applyMove(s, ids(s)[0] ?? '');
    expect(replay(s.config, s.seed, s.log.map((e) => e.move))).toEqual(s);
  });

  it('アクションが完了するまでは、選択を1つずつ取り消せる', () => {
    // rules.md v0.8 15-1-1、15-1-3
    const start = firstTurn();
    const s1 = applyMove(start, 'act:import:normal');
    // 臨時ワーカーの組み合わせなど、手番中の選択は取り消せる。
    const back = undoLast(s1);
    expect(back).not.toBeNull();
    expect(back?.stack).toEqual(start.stack);
    expect(back?.players).toEqual(start.players);
  });

  it('手番の終了・パスの後は取り消せない', () => {
    // rules.md v0.8 15-1-2（次のプレイヤーがアクションを選択した）
    // 巻き戻しは記録の再生で行うため、局面の書き換えをせず実際の選択だけで進める。
    let s = firstTurn();
    s = play(s, 'act:import:normal', 'temp:0', 'count:1');
    expect(undoLast(s)).not.toBeNull();
    s = applyMove(s, 'end');
    expect(undoLast(s)).toBeNull();
    const t = applyMove(firstTurn(), 'pass');
    expect(undoLast(t)).toBeNull();
  });

  it('カードを引いた選択は取り消せない', () => {
    // rules.md v0.8 15-1-2（山札から新たなカードが公開された）
    let s = base();
    s = applyMove(s, 'act:research:normal');
    expect(top(s).t).toBe('turn');
    expect(undoLast(s)).toBeNull();
  });

  it('ドラフトの選択・ボーナスタイルの選択・襲撃の宣言は取り消せない', () => {
    // rules.md v0.8 19-6-3
    let s = base();
    s = play(s, 'pass');
    expect(top(s).t).toBe('passTile');
    s = applyMove(s, ids(s)[0] ?? '');
    expect(undoLast(s)).toBeNull();
    expect(s.log.slice(0, 9).every((entry) => entry.checkpoint)).toBe(true);
    while (top(s).t !== 'raidDeclare') {
      s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    }
    s = applyMove(s, 'raid:none');
    expect(undoLast(s)).toBeNull();
  });

  it('取り消した後は、同じ手番の続きから選び直せる', () => {
    // rules.md v0.8 15-1-1
    let s = firstTurn();
    const p = me(s).index;
    s = play(s, 'act:import:normal', 'temp:0', 'count:2');
    const undone = undoLast(s);
    expect(undone).not.toBeNull();
    if (undone === null) return;
    expect(me(undone).index).toBe(p);
    expect(top(undone).t).toBe('importCount');
    // 選び直しは記録に残る。
    const redone = applyMove(undone, 'count:1');
    expect(redone.log.at(-1)?.move).toBe('count:1');
    expect(me(redone).materials).toBe(me(undone).materials + 1);
  });
});
