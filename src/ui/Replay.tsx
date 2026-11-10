// 記録（リプレイ）の再生画面（ユーザー決定 2026-11-10）。読み込んだ記録を1手ずつ進め・戻し、好きな局面を見る。
// 盤面はゲーム画面（Game）を読むだけの形で使い、どのタブでも手札を見せる（終わった対局の記録のため）。
// 「この局面から遊ぶ」で、その局面からローカル版の対局として続けられる（記録の復元）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { DATA_VERSION } from '../data/index.ts';
import { replayDataChanged, replayPrefix, replayTo, type ReplayRecord } from '../game/replay.ts';
import type { GameState } from '../game/types.ts';
import { Game, type GameController, type Settings } from './Game.tsx';
import { colorOf } from './model.ts';
import { downloadReplay } from './replay-file.ts';

/** 局面の写しを取っておく間隔（手数）。戻る・飛ぶときは、手前の写しから再生し直す。 */
const CACHE_EVERY = 20;

const AUTOPLAY_MS: Readonly<Record<string, number>> = { slow: 1500, normal: 700, fast: 250 };

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
  const last = prefix.playable;
  const cache = useRef(new Map<number, GameState>());
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');

  const state = useMemo(() => {
    const known = [...cache.current.keys()].filter((k) => k <= index).sort((a, b) => b - a)[0];
    const from = known === undefined ? undefined : cache.current.get(known);
    let s = from;
    // 写しの間隔ごとに局面を残しながら進める。
    for (let target = (known ?? 0) + CACHE_EVERY; target <= index; target += CACHE_EVERY) {
      s = replayTo(record, target, undefined, s);
      cache.current.set(target, s);
    }
    return replayTo(record, index, undefined, s);
  }, [record, index]);

  useEffect(() => {
    if (!playing) return undefined;
    if (index >= last) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), AUTOPLAY_MS[speed]);
    return () => clearTimeout(timer);
  }, [playing, index, last, speed]);

  const step = prefix.steps[index - 1];
  const player = step === undefined ? undefined : state.players[step.player];
  const ctl: GameController = {
    state,
    seat: null,
    choose: () => {},
    undo: () => {},
    undoReason: '記録の再生中は取り消せない',
    readOnly: true,
    revealAll: true,
    saveReplay: () => downloadReplay(record),
  };
  const go = (n: number): void => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, n)));
  };

  const toolbar = (
    <div className="replay-bar" data-ui="replay-bar">
      <strong>記録の再生</strong>
      <button type="button" className="btn" data-ui="replay-first" onClick={() => go(0)} disabled={index === 0}>
        ⏮ 最初
      </button>
      <button type="button" className="btn" data-ui="replay-prev" onClick={() => go(index - 1)} disabled={index === 0}>
        ◀ 1手戻る
      </button>
      <button type="button" className="btn primary" data-ui="replay-play" onClick={() => setPlaying(!playing)} disabled={index >= last}>
        {playing ? '⏸ 止める' : '▶ 自動で進める'}
      </button>
      <button type="button" className="btn" data-ui="replay-next" onClick={() => go(index + 1)} disabled={index >= last}>
        1手進む ▶
      </button>
      <button type="button" className="btn" data-ui="replay-last" onClick={() => go(last)} disabled={index >= last}>
        最後 ⏭
      </button>
      <select value={speed} data-ui="replay-speed" onChange={(e) => setSpeed(e.target.value as 'slow' | 'normal' | 'fast')} aria-label="自動で進める速さ">
        <option value="slow">ゆっくり</option>
        <option value="normal">ふつう</option>
        <option value="fast">速い</option>
      </select>
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        data-ui="replay-seek"
        aria-label="手数"
        onChange={(e) => go(Number(e.target.value))}
      />
      <span className="replay-pos" data-ui="replay-pos">
        {index}／{last}手
        {step !== undefined && player !== undefined ? (
          <>
            {'：'}
            <span style={{ color: colorOf(step.player) }}>{player.name}</span> {step.label}
          </>
        ) : (
          '：対局の始まり'
        )}
      </span>
      <button type="button" className="btn" data-ui="replay-continue" onClick={() => onContinue(structuredClone(state))}>
        この局面から遊ぶ
      </button>
      <button type="button" className="btn" data-ui="replay-close" onClick={onLeave}>
        閉じる
      </button>
      {replayDataChanged(record) ? (
        <span className="replay-warn" data-ui="replay-data-changed">
          記録を作ったときとゲームのデータが違う（記録 {record.dataVersion.slice(0, 6)}・いま {DATA_VERSION.slice(0, 6)}）。結果が当時と変わることがある。
        </span>
      ) : null}
      {prefix.error !== null ? (
        <span className="replay-warn" data-ui="replay-error">
          {prefix.error}
        </span>
      ) : null}
    </div>
  );

  return <Game key={record.seed} ctl={ctl} settings={{ ...settings, follow: false }} onRestart={onLeave} toolbar={toolbar} />;
};
