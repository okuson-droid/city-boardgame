// 手番の知らせの音（ユーザー決定 2026-11-06）。音源の素材は持たず、Web Audio で短いチャイムを合成する。
// 入・切はブラウザに保存する（localStorage の `sound`）。保存できない環境では入とみなす。

import { useEffect, useState } from 'react';

const STORE_KEY = 'sound';

const loadEnabled = (): boolean => {
  try {
    return window.localStorage.getItem(STORE_KEY) !== 'off';
  } catch {
    return true;
  }
};

const saveEnabled = (on: boolean): void => {
  try {
    window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
  } catch {
    // 保存できない環境では、その画面の間だけ有効にする。
  }
};

const listeners = new Set<(on: boolean) => void>();
let enabled = typeof window === 'undefined' ? false : loadEnabled();

/** 音の入・切（画面のどこで切り替えても同じ値を共有する）。 */
export const useSoundEnabled = (): [boolean, (on: boolean) => void] => {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  const set = (next: boolean): void => {
    enabled = next;
    saveEnabled(next);
    for (const l of listeners) l(next);
  };
  return [on, set];
};

let context: AudioContext | null = null;

/** 手番が来たことを知らせる、2音のやわらかいチャイム。音を出せない環境では何もしない。 */
export const playTurnChime = (): void => {
  if (!enabled) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;
    context ??= new Ctor();
    const ctx = context;
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime + 0.02;
    // ソ→ド（784Hz → 1047Hz）。各音は柔らかく立ち上がり、0.35秒で消える。
    [784, 1047].forEach((freq, i) => {
      const t = start + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    // 音を出せない環境（自動再生の制限など）では知らせを省く。
  }
};
