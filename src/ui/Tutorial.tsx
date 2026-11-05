// チュートリアルの画面（ユーザー決定 2026-11-04）。いつものゲーム画面（Game）の上に、案内の札（コーチ）を重ねる。
// - 案内の中身と進め方は src/tutorial/tutorial.ts。ここは表示と、自動の打ち手を少し間をおいて動かすことだけを行う。
// - 選んでよい所作（data-target）を光らせる。光っていない所作を選んだら受け付けず、案内を出し直す。
// - 視点はプレイヤーの席に固定し、他の席の手札は出さない（オンライン版と同じ GameController.seat を使う）。

import { useEffect, useMemo, useState } from 'react';
import { GAME_DATA } from '../data/index.ts';
import { decider, isGameOver } from '../game/engine.ts';
import { sceneOf } from '../game/queries.ts';
import { targetOf } from '../game/targets.ts';
import type { Option } from '../game/types.ts';
import {
  allowedOptions,
  botsMayMove,
  chooseInTutorial,
  createTutorial,
  currentStep,
  nextStep,
  skipTutorial,
  stepActive,
  stepBot,
  STEPS,
  TUTORIAL_SEAT,
  type TutorialState,
} from '../tutorial/tutorial.ts';
import { Game, type GameController, type Settings } from './Game.tsx';

/** 自動の打ち手の1手の間（ミリ秒）。演出の速さに合わせる。 */
const BOT_DELAY: Record<Settings['speed'], number> = { standard: 700, fast: 300, none: 0 };

/** 光らせる型（末尾の * は前方一致）を CSS のセレクタにする。 */
const selectorOf = (pattern: string): string => {
  const value = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
  const escaped = value.replace(/["\\]/g, '\\$&');
  return pattern.endsWith('*') ? `[data-target^="${escaped}"]` : `[data-target="${escaped}"]`;
};

const highlightCss = (patterns: readonly string[]): string => {
  if (patterns.length === 0) return '';
  const selectors = patterns.map(selectorOf);
  return [
    // 光らせるもの以外の所作は薄くする（ゲームの画面は選べるものすべてに枠を付けるため、案内の対象が埋もれないように）。
    `.game [data-target]${selectors.map((s) => `:not(${s})`).join('')} { opacity: 0.35; filter: grayscale(0.6); }`,
    `${selectors.join(',\n')} { outline: 3px solid var(--coach, #e8a33d) !important; outline-offset: 2px; animation: coach-pulse 1.2s ease-in-out infinite; }`,
    // 個人ボードのマスは SVG のため、枠線で光らせる。
    `${selectors.map((s) => `g${s} polygon`).join(',\n')} { stroke: var(--coach, #e8a33d) !important; stroke-width: 4 !important; }`,
  ].join('\n');
};

/**
 * 選択肢を、光らせる data-target の型にする。マスに対応する選択肢（土地タイル・建物・英雄の初期配置など）は、
 * 画面ではマス（cell:<マス>）を押して選ぶため、マスの型も加える。
 */
const patternsOf = (options: readonly Option[]): string[] =>
  options.flatMap((o) => {
    const target = targetOf(o);
    return target?.kind === 'cell' ? [o.id, `cell:${target.cell}`] : [o.id];
  });

export const TutorialGame = ({ settings, onLeave }: { settings: Settings; onLeave: () => void }) => {
  const [t, setT] = useState<TutorialState>(() => createTutorial());
  const [warning, setWarning] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // 自動の打ち手を、少し間をおいて1手ずつ動かす。
  useEffect(() => {
    if (!botsMayMove(t)) return undefined;
    const timer = window.setTimeout(() => setT((current) => stepBot(current)), BOT_DELAY[settings.speed]);
    return () => window.clearTimeout(timer);
  }, [t, settings.speed]);

  const step = currentStep(t);
  const active = stepActive(t);
  const mine = !isGameOver(t.game) && decider(t.game) === TUTORIAL_SEAT;
  const allowed = useMemo(() => allowedOptions(t, GAME_DATA), [t]);

  const ctl: GameController = {
    state: t.game,
    seat: TUTORIAL_SEAT,
    choose: (id) => {
      // 画面内だけの操作（建物の種類を選ぶ等）は、ゲームの選択ではないため Game が受け持つ。
      const next = chooseInTutorial(t, id);
      if (next === null) {
        setWarning(step !== null && step.kind === 'next' && active ? '先に案内を読んで「次へ」を押す。' : 'いまは光っているところを選ぶ。');
        return;
      }
      setWarning(null);
      setT(next);
    },
    undo: () => undefined,
    undoReason: 'チュートリアルでは取り消しを使わない',
    message: null,
  };

  // 光らせるもの：手順が当てはまるときは手順の指定、台本にない選択のときは選べるものすべて。
  // 手順に光らせる指定がない（どれでも選べる）ときも、選べるものを光らせる。
  const patterns =
    step === null || !mine
      ? []
      : active && step.highlight !== undefined
        ? step.highlight
        : patternsOf(allowed);

  const title = step === null ? null : active ? step.title : mine ? sceneOf(t.game).heading : 'ほかの人の番';
  const body =
    step === null
      ? null
      : active
        ? step.body({ state: t.game, d: GAME_DATA })
        : mine
          ? 'キャラクターやカードの効果で、選ぶことがある。光っているものから選ぶ。'
          : 'アオイとミドリが動いている。少し待つ。';

  return (
    <>
      <style>{`@keyframes coach-pulse { 0%, 100% { outline-color: #e8a33d; } 50% { outline-color: #ffd27a; } }\n${highlightCss(patterns)}`}</style>
      <Game ctl={ctl} settings={{ ...settings, follow: false }} onRestart={onLeave} />
      {step !== null ? (
        <aside
          className={`coach${collapsed ? ' collapsed' : ''}${active && step.placement === 'left' ? ' coach-left' : ''}`}
          data-ui="coach"
          aria-live="polite"
        >
          <div className="coach-head">
            <span className="coach-progress">
              {Math.min(t.step + 1, STEPS.length)}／{STEPS.length}
            </span>
            <strong className="coach-title">{title}</strong>
            <button type="button" className="btn small" data-ui="coach-collapse" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? '開く' : '小さく'}
            </button>
          </div>
          {collapsed ? null : (
            <>
              <p className="coach-body">{body}</p>
              {warning !== null ? <p className="coach-warning">{warning}</p> : null}
              <div className="coach-actions">
                {step.kind === 'next' && active ? (
                  <button
                    type="button"
                    className="btn primary"
                    data-ui="coach-next"
                    onClick={() => {
                      setWarning(null);
                      setT(nextStep(t));
                    }}
                  >
                    次へ
                  </button>
                ) : null}
                <button type="button" className="btn small" data-ui="coach-skip" onClick={() => setT(skipTutorial(t))}>
                  案内をやめて自由に遊ぶ
                </button>
                <button type="button" className="btn small" data-ui="coach-leave" onClick={onLeave}>
                  チュートリアルを終える
                </button>
              </div>
            </>
          )}
        </aside>
      ) : null}
    </>
  );
};
