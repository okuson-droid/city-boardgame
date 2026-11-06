// ローカル版の入口。人数とシードを選んでゲームを始める。

import { useEffect, useState } from 'react';
import { GAME_DATA, TUNER_PLAYTEST } from '../data/index.ts';
import { createGame } from '../game/engine.ts';
import type { GameState } from '../game/types.ts';
import { LocalGame, type Settings } from './Game.tsx';
import { detectTransport, type Session, type Transport } from '../online/client.ts';
import { OnlineEntry, OnlineGame } from './Online.tsx';
import { LegendButton } from './Legend.tsx';
import { HoverTip } from './Tip.tsx';
import { TutorialGame } from './Tutorial.tsx';

/**
 * 装飾の段階（ユーザーの選定待ち、2026-11-06）。URL の #deco=1|2|3 で選ぶ。0（既定）は従来の見た目である。
 * 段階 n では data-deco に 1〜n を並べ、deco.css は [data-deco~='n'] で段階 n 以上に効く規則を書く。
 */
const applyDeco = (): void => {
  const level = Number(new URLSearchParams(window.location.hash.slice(1)).get('deco') ?? '0');
  const n = Number.isInteger(level) ? Math.max(0, Math.min(3, level)) : 0;
  const value = Array.from({ length: n }, (_, i) => String(i + 1)).join(' ');
  if (value === '') document.documentElement.removeAttribute('data-deco');
  else document.documentElement.setAttribute('data-deco', value);
};

const readSettings = (): Settings => {
  applyDeco();
  const params = new URLSearchParams(window.location.hash.slice(1));
  const speed = params.get('speed');
  return {
    speed: speed === 'none' || speed === 'fast' ? speed : 'standard',
    follow: params.get('follow') !== 'off',
  };
};

/** 公開ページのチューナーの場所（GitHub Actions のビルドで与える）。無ければリンクを出さない。 */
const TUNER_URL = String(import.meta.env['VITE_TUNER_URL'] ?? '');

const randomSeed = (): number => Number(String(Date.now()).slice(-9));

const Screen = () => {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [game, setGame] = useState<GameState | null>(null);
  const [players, setPlayers] = useState(GAME_DATA.params.playerCount.min);
  const [seed, setSeed] = useState(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('seed');
    return fromHash !== null ? Number(fromHash) : randomSeed();
  });

  const [transport, setTransport] = useState<Transport | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => {
    // 試遊（調整案のデータ）ではオンライン版を出さない。サーバーのデータと食い違うためである。
    if (!TUNER_PLAYTEST) void detectTransport().then(setTransport);
  }, []);

  if (tutorial) {
    return <TutorialGame settings={settings} onLeave={() => setTutorial(false)} />;
  }
  if (session !== null && transport !== null) {
    return <OnlineGame key={session.code} transport={transport} session={session} settings={settings} onLeave={() => setSession(null)} />;
  }
  if (game !== null) {
    return <LocalGame key={game.seed} initial={game} settings={settings} onRestart={() => setGame(null)} />;
  }
  return (
    <div className="start">
      <h1>都市開発ボードゲーム（仮）</h1>
      {TUNER_PLAYTEST ? <p className="tuner-banner">調整案を適用したデータで試遊している（チューナー）</p> : null}
      <p className="muted">ローカル版（1台で交代して遊ぶ）。rules.md v{GAME_DATA.params.rulesVersion}。仮置きのデータには「仮」の印を付けている。</p>
      {!TUNER_PLAYTEST ? (
        <div className="start-row tutorial-row">
          <button type="button" className="btn primary" data-ui="tutorial" onClick={() => setTutorial(true)}>
            チュートリアル（はじめての人へ）
          </button>
          <span className="muted">実際に1ラウンド遊びながら、ルールを一手ずつ案内する。</span>
        </div>
      ) : null}
      <div className="start-row">
        <span>人数</span>
        {Array.from(
          { length: GAME_DATA.params.playerCount.max - GAME_DATA.params.playerCount.min + 1 },
          (_, i) => GAME_DATA.params.playerCount.min + i,
        ).map((n) => (
          <button key={n} type="button" className={`btn${players === n ? ' active' : ''}`} data-ui={`players-${n}`} onClick={() => setPlayers(n)}>
            {n}人
          </button>
        ))}
      </div>
      <div className="start-row">
        <span>シード</span>
        <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
      </div>
      <div className="start-row">
        <span>演出</span>
        {(['standard', 'fast', 'none'] as const).map((speed) => (
          <button key={speed} type="button" className={`btn${settings.speed === speed ? ' active' : ''}`} onClick={() => setSettings({ ...settings, speed })}>
            {speed === 'standard' ? '標準' : speed === 'fast' ? '速い' : 'なし'}
          </button>
        ))}
        <span>追いかける</span>
        <button type="button" className={`btn${settings.follow ? ' active' : ''}`} onClick={() => setSettings({ ...settings, follow: !settings.follow })}>
          {settings.follow ? '入' : '切'}
        </button>
      </div>
      <button type="button" className="btn primary" data-target="start" onClick={() => setGame(createGame({ playerCount: players }, seed))}>
        はじめる
      </button>
      <div className="start-row">
        <LegendButton />
        {TUNER_URL !== '' && !TUNER_PLAYTEST ? (
          <a className="btn" data-ui="tuner-link" href={TUNER_URL}>
            データを編集する（チューナー）
          </a>
        ) : null}
      </div>
      {transport !== null ? <OnlineEntry transport={transport} onEnter={setSession} /> : null}
    </div>
  );
};

/** 画面全体。カーソルを合わせたときの補足（HoverTip）は、どの画面にも1つだけ置く。 */
export const App = () => (
  <>
    <Screen />
    <HoverTip />
  </>
);
