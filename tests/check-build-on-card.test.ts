// カードの上に建てる命令は住宅だけを受け付ける（2026-11-27、特別な市民カード35で公開ページの検査が落ちた件）。
import { describe, expect, it } from 'vitest';
import { checkGameData } from '../src/data/check.ts';
import { GAME_DATA } from '../src/data/index.ts';
import { withScripts } from './helpers/game.ts';

describe('カードの上に建てる命令の検査', () => {
  it('住宅以外（砦）を選ぶと、入れ子の中でも問題として報告する', () => {
    // rules.md v0.8 5-1（建物）、docs/effect-commands.md の buildOnCard
    const id = GAME_DATA.specialCitizens[0]!.id;
    const d = withScripts({
      sc: { [id]: [{ ability: 'onAcquire', do: [{ op: 'later', do: [{ op: 'buildOnCard', building: 'fort', count: 1 }] }] }] },
    });
    const issues = checkGameData(d);
    expect(issues.some((i) => i.path.endsWith('.do[0].do[0].building') && i.message.includes('住宅だけ'))).toBe(true);
    const ok = withScripts({ sc: { [id]: [{ ability: 'onAcquire', do: [{ op: 'buildOnCard', building: 'house', count: 1 }] }] } });
    expect(checkGameData(ok)).toEqual([]);
  });
});
