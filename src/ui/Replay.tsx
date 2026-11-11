// 記録（リプレイ）の再生画面（ユーザー決定 2026-11-10）。読み込んだ記録を1手ずつ・手番ずつ進め・戻し、好きな局面を見る。
// 盤面はゲーム画面（Game）を読むだけの形で使う。
// - 視点「全員」：どのタブでも手札を見せる（終わった対局の記録のため）。
// - 視点をプレイヤーに固定：そのプレイヤーのタブにとどまり、手札はその人のものだけを見せる（その人の目で対局を追う）。
//   手番の送り（前の手番・次の手番）もその人の手番だけに止まる。
// 下の帯に、いまの手番で選んだ手を順に並べ、それぞれの選択で起きたこと（増減・配置・建設・得点など）を添える。
// 「この局面から遊ぶ」で、その局面からローカル版の対局として続けられる（記録の復元）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { DATA_VERSION } from '../data/index.ts';
import { deltaText, eventText, turnDelta } from '../game/narrate.ts';
import { replayDataChanged, replayPrefix, replayTo, replayTurns, type ReplayRecord, type ReplayStep } from '../game/replay.ts';
import type { GameState } from '../game/types.ts';
import { Game, type GameController, type Settings } from './Game.tsx';
import { colorOf } from './model.ts';
import { downloadReplay } from './replay-file.ts';

/** 局面の写しを取っておく間隔（手数）。戻る・飛ぶときは、手前の写しから再生し直す。 */
const CACHE_EVERY = 20;

const AUTOPLAY_MS: Readonly<Record<string, number>> = { slow: 1500, normal: 700, fast: 250 };

/** 手番のあいだの、そのプレイヤーの増減の合計（選択の処理によるものだけ）。 */
const turnDeltaText = (steps: readonly ReplayStep[], player: number): string => deltaText(turnDelta(steps.flatMap((s) => s.events), player));

/**
 * 1手で起きたことの文。手番のプレイヤー自身の出来事は名前を省き、他のプレイヤーの出来事（襲撃・常時効果など）だけ名前を付ける。
 * トラックが続けて上がったときは「が9になった（到達報酬 7・8・9）」のように1つにまとめる。
 */
const stepDetails = (state: GameState, step: ReplayStep, turnPlayer: number, nameOf: (p: number) => string): string[] => {
  const who = (p: number): string => (p === turnPlayer ? '' : nameOf(p));
  const rewards = new Map<string, number[]>();
  const lastLevel = new Map<string, number>();
  for (const e of step.events) {
    if (e.type === 'levelReward') rewards.set(`${e.player}:${e.track}`, [...(rewards.get(`${e.player}:${e.track}`) ?? []), e.level]);
    if (e.type === 'trackRaised') lastLevel.set(`${e.player}:${e.track}`, e.level);
  }
  const texts: string[] = [];
  for (const e of step.events) {
    if (e.type === 'action' || e.type === 'levelReward' || (e.type === 'delta' && e.cause === 'move')) continue;
    if (e.type === 'trackRaised') {
      const key = `${e.player}:${e.track}`;
      if (lastLevel.get(key) !== e.level) continue;
      const levels = rewards.get(key) ?? [];
      const reward = levels.length === 0 ? '' : `（到達報酬 ${levels.join('・')}）`;
      texts.push(`${who(e.player)}${e.track === 'military' ? '軍事レベル' : 'インフラレベル'}が${e.level}になった${reward}`.trim());
      continue;
    }
    const text = eventText(state, e, undefined, who);
    if (text !== null) texts.push(text.trim());
  }
  return texts;
};

export const ReplayViewer = ({
  record,
  settings,
  onLeave,
  onContinue,
}: {
  record: ReplayRecord;
  settings: Settings;
  onLeave: () => void;
  /** この局面からローカル版の対局として続ける。 */
  onContinue: (state: GameState) => void;
}) => {
  const prefix = useMemo(() => replayPrefix(record), [record]);
  const turns = useMemo(() => replayTurns(prefix.steps), [prefix]);
  const last = prefix.playable;
  const cache = useRef(new Map<number, GameState>());
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  /** 視点を固定するプレイヤー。null は全員の手札を見る。 */
  const [fixed, setFixed] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const state = useMemo(() => {
    const known = [...cache.current.keys()].filter((k) => k <= index).sort((a, b) => b - a)[0];
    let s = known === undefined ? undefined : cache.current.get(known);
    // 写しの間隔ごとに局面を残しながら進める。
    for (let target = (known ?? 0) + CACHE_EVERY; target <= index; target += CACHE_EVERY) {
      s = replayTo(record, target, undefined, s);
      cache.current.set(target, s);
    }
    return replayTo(record, index, undefined, s);
  }, [record, index]);

  /** 手番の送り先：手番の終わり（その手番の選択をすべて適用した局面）。視点を固定していれば、その人の手番だけ。 */
  const turnEnds = useMemo(() => turns.filter((t) => fixed === null || t.player === fixed).map((t) => t.to), [turns, fixed]);
  const prevTurn = [...turnEnds].reverse().find((n) => n < index) ?? 0;
  const nextTurn = turnEnds.find((n) => n > index) ?? last;

  useEffect(() => {
    if (!playing) return undefined;
    if (index >= last) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), AUTOPLAY_MS[speed]);
    return () => clearTimeout(timer);
  }, [playing, index, last, speed]);

  const nameOf = (p: number): string => state.players[p]?.name ?? `P${p}`;
  /** いま見ている手番：直前に適用した手を含む手番（手番の終わりに止めたときは、その手番）。始まりの局面では最初の手番。 */
  const turn = turns.find((t) => index >= t.from && index <= t.to) ?? (index === 0 ? turns[0] : undefined);
  const turnSteps = turn === undefined ? [] : prefix.steps.slice(turn.from - 1, turn.to);

  const ctl: GameController = {
    state,
    seat: fixed,
    choose: () => {},
    undo: () => {},
    undoReason: '記録の再生中は取り消せない',
    readOnly: true,
    revealAll: fixed === null,
    saveReplay: () => downloadReplay(record),
  };
  const go = (n: number): void => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, n)));
  };

  const toolbar = (
    <div className="replay-bar" data-ui="replay-bar">
      <div className="replay-controls">
        <strong>記録の再生</strong>
        <button type="button" className="btn" data-ui="replay-first" onClick={() => go(0)} disabled={index === 0} title="最初へ">
          ⏮
        </button>
        <button type="button" className="btn" data-ui="replay-prev-turn" onClick={() => go(prevTurn)} disabled={index === 0}>
          ◀◀ 前の手番
        </button>
        <button type="button" className="btn" data-ui="replay-prev" onClick={() => go(index - 1)} disabled={index === 0}>
          ◀ 1手
        </button>
        <button type="button" className="btn primary" data-ui="replay-play" onClick={() => setPlaying(!playing)} disabled={index >= last}>
          {playing ? '⏸ 止める' : '▶ 自動'}
        </button>
        <button type="button" className="btn" data-ui="replay-next" onClick={() => go(index + 1)} disabled={index >= last}>
          1手 ▶
        </button>
        <button type="button" className="btn" data-ui="replay-next-turn" onClick={() => go(nextTurn)} disabled={index >= last}>
          次の手番 ▶▶
        </button>
        <button type="button" className="btn" data-ui="replay-last" onClick={() => go(last)} disabled={index >= last} title="最後へ">
          ⏭
        </button>
        <select value={speed} data-ui="replay-speed" onChange={(e) => setSpeed(e.target.value as 'slow' | 'normal' | 'fast')} aria-label="自動で進める速さ">
          <option value="slow">ゆっくり</option>
          <option value="normal">ふつう</option>
          <option value="fast">速い</option>
        </select>
        <input type="range" min={0} max={last} value={index} data-ui="replay-seek" aria-label="手数" onChange={(e) => go(Number(e.target.value))} />
        <span className="replay-pos" data-ui="replay-pos">
          {index}／{last}手
        </span>
        <label className="replay-fixed">
          視点
          <select
            value={fixed === null ? 'all' : String(fixed)}
            data-ui="replay-fixed"
            onChange={(e) => setFixed(e.target.value === 'all' ? null : Number(e.target.value))}
          >
            <option value="all">全員（手札をすべて見る）</option>
            {state.players.map((p) => (
              <option key={p.index} value={p.index}>
                {p.name}に固定
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" data-ui="replay-panel" onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? '行動を畳む' : '行動を見る'}
        </button>
        <button type="button" className="btn" data-ui="replay-continue" onClick={() => onContinue(structuredClone(state))}>
          この局面から遊ぶ
        </button>
        <button type="button" className="btn" data-ui="replay-close" onClick={onLeave}>
          閉じる
        </button>
      </div>
      {panelOpen ? (
        <div className="replay-turn" data-ui="replay-turn">
          {turn === undefined ? (
            <p className="muted">対局の始まり</p>
          ) : (
            <>
              <p className="replay-turn-head">
                {turn.round === 0 ? 'ドラフト' : `第${turn.round}ラウンド`}・
                <span style={{ color: colorOf(turn.player) }}>{nameOf(turn.player)}</span>の手番（{turn.from}〜{turn.to}手目）
                {turnDeltaText(turnSteps, turn.player) !== '' ? <span className="muted">　この手番の増減：{turnDeltaText(turnSteps, turn.player)}</span> : null}
              </p>
              <ol className="replay-steps">
                {turnSteps.map((step) => {
                  const details = stepDetails(state, step, turn.player, nameOf);
                  const status = step.index === index ? 'current' : step.index > index ? 'future' : 'done';
                  return (
                    <li key={step.index} className={`replay-step ${status}`} value={step.index}>
                      <button type="button" className="link" data-ui="replay-step" onClick={() => go(step.index)}>
                        {step.label}
                      </button>
                      {details.length > 0 ? <span className="replay-step-detail">{details.join('／')}</span> : null}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      ) : null}
      {replayDataChanged(record) ? (
        <p className="replay-warn" data-ui="replay-data-changed">
          記録を作ったときとゲームのデータが違う（記録 {record.dataVersion.slice(0, 6)}・いま {DATA_VERSION.slice(0, 6)}）。結果が当時と変わることがある。
        </p>
      ) : null}
      {prefix.error !== null ? (
        <p className="replay-warn" data-ui="replay-error">
          {prefix.error}
        </p>
      ) : null}
    </div>
  );

  return <Game key={record.seed} ctl={ctl} settings={{ ...settings, follow: false }} onRestart={onLeave} toolbar={toolbar} />;
};
