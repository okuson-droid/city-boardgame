import { describe, expect, it } from 'vitest';
import { decider, getOptions, isGameOver } from '../src/game/engine.ts';
import { createRng, nextInt } from '../src/game/rng.ts';
import {
  allowedOptions,
  botsMayMove,
  chooseInTutorial,
  createTutorial,
  currentStep,
  nextStep,
  stepActive,
  stepBot,
  STEPS,
  TUTORIAL_SEAT,
  type TutorialState,
} from '../src/tutorial/tutorial.ts';

type Pick = 'first' | 'last' | 'random';

/** 案内に従って遊ぶ。visited は表示した手順の id の列。 */
const playGuided = (pick: Pick, maxMoves = 4000, character?: number): { t: TutorialState; visited: string[] } => {
  let t = createTutorial();
  let rng = createRng(7);
  const visited: string[] = [];
  for (let i = 0; i < maxMoves && !isGameOver(t.game); i += 1) {
    const step = currentStep(t);
    if (step !== null && stepActive(t) && visited[visited.length - 1] !== step.id) visited.push(step.id);
    if (step !== null && step.kind === 'next' && stepActive(t)) {
      t = nextStep(t);
      continue;
    }
    if (botsMayMove(t)) {
      t = stepBot(t);
      continue;
    }
    const options = allowedOptions(t);
    expect(options.length, `${step?.id ?? '自由'} で選べる選択肢がない`).toBeGreaterThan(0);
    let option = pick === 'first' ? options[0] : pick === 'last' ? options[options.length - 1] : undefined;
    if (character !== undefined && step?.id === 'draft-character') option = options[character % options.length];
    if (pick === 'random' && !(character !== undefined && step?.id === 'draft-character')) {
      const [k, next] = nextInt(rng, options.length);
      rng = next;
      option = options[k];
    }
    // 自由に遊ぶ段階では、終局まで進むよう「パス」を優先する。
    if (step === null) option = options.find((o) => o.id === 'pass') ?? options.find((o) => o.id === 'end') ?? option;
    const next = chooseInTutorial(t, option?.id ?? '');
    expect(next, `${step?.id ?? '自由'} で ${option?.id} を選べない`).not.toBeNull();
    if (next !== null) t = next;
  }
  return { t, visited };
};

describe('チュートリアル（ユーザー決定 2026-11-04）', () => {
  it('プレイヤーの席が第1ラウンドの最初の手番になる', () => {
    // rules.md v0.8 12-0-3（第1ラウンドのスタートプレイヤー）
    let t = createTutorial();
    while (t.game.round === 0) {
      if (currentStep(t)?.kind === 'next' && stepActive(t)) t = nextStep(t);
      else if (botsMayMove(t)) t = stepBot(t);
      else t = chooseInTutorial(t, allowedOptions(t)[0]?.id ?? '') ?? t;
    }
    expect(t.game.turnOrder[0]).toBe(TUTORIAL_SEAT);
  });

  it('案内のとおりに選べば、主な手順をすべて通って最後まで遊べる', () => {
    // rules.md v0.8 1-0-6、12-0-1（ラウンドの進行）
    for (const pick of ['first', 'last', 'random'] as const) {
      const { t, visited } = playGuided(pick);
      expect(isGameOver(t.game), pick).toBe(true);
      for (const id of ['welcome', 'draft-board', 'draft-bonus', 'draft-character', 'screen', 'pioneer', 'pioneer-place', 'build', 'build-place', 'research', 'raid', 'round2', 'scoring', 'free']) {
        expect(visited, `${pick}：${id}`).toContain(id);
      }
      // 手順は台本の順に進む。
      const order = visited.map((id) => STEPS.findIndex((s) => s.id === id));
      expect(order, pick).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('どのキャラクターを選んでも、主な手順を通って最後まで遊べる', () => {
    // rules.md v0.8 2-5（固有キャラクター）、2-6（ドラフト）
    for (let character = 0; character < 8; character += 1) {
      const { t, visited } = playGuided('first', 4000, character);
      expect(isGameOver(t.game), `キャラクター${character}`).toBe(true);
      for (const id of ['pioneer', 'pioneer-place', 'build', 'build-place', 'research', 'round2', 'free']) {
        expect(visited, `キャラクター${character}：${id}`).toContain(id);
      }
    }
  });

  it('案内の手順で選べない選択は受け付けない', () => {
    // 指示書（チュートリアル）：光っている所作だけを選ばせる
    let t = createTutorial();
    while (currentStep(t)?.id !== 'pioneer' || !stepActive(t)) {
      if (currentStep(t)?.kind === 'next' && stepActive(t)) t = nextStep(t);
      else if (botsMayMove(t)) t = stepBot(t);
      else t = chooseInTutorial(t, allowedOptions(t)[0]?.id ?? '') ?? t;
    }
    expect(decider(t.game)).toBe(TUTORIAL_SEAT);
    expect(allowedOptions(t).map((o) => o.id)).toEqual(['act:pioneer:normal']);
    expect(getOptions(t.game).some((o) => o.id === 'act:build:normal')).toBe(true);
    expect(chooseInTutorial(t, 'act:build:normal')).toBeNull();
    expect(chooseInTutorial(t, 'act:pioneer:normal')).not.toBeNull();
  });
});
