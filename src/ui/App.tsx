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

const readSettings = (): Settings => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const speed = params.get('speed');
  return {
    speed: speed === 'none' || speed === 'fast' ? speed : 'standard',
    follow: params.get('follow') !== 'off',
  };
};

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
  useEffect(() => {
    void detectTransport().then(setTransport);
  }, []);

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
