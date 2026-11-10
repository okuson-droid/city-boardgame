// ローカル版の入口。人数とシードを選んでゲームを始める。

import { useEffect, useState } from 'react';
import { DATA_VERSION, GAME_DATA, TUNER_PLAYTEST } from '../data/index.ts';
import { createGame } from '../game/engine.ts';
import type { GameState } from '../game/types.ts';
import { LocalGame, type Settings } from './Game.tsx';
import { detectTransport, type Session, type Transport } from '../online/client.ts';
import { OnlineEntry, OnlineGame } from './Online.tsx';
import { LegendButton } from './Legend.tsx';
import { HoverTip } from './Tip.tsx';
import { TutorialGame } from './Tutorial.tsx';
import { Catalog, type CatalogView } from './Catalog.tsx';
import { RulesButton } from './RulesDeck.tsx';
import { playTurnChime, useSoundEnabled } from './sound.ts';
import type { ReplayRecord } from '../game/replay.ts';
import { ReplayViewer } from './Replay.tsx';
import { readReplayFile } from './replay-file.ts';

const readSettings = (): Settings => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const speed = params.get('speed');
  return {
    speed: speed === 'none' || speed === 'fast' ? speed : 'standard',
    // 視点は勝手に変えない（ユーザー決定 2026-11-06）。オンライン版で他の人の手番を追うのは #follow=on か「追いかける」を入にしたときだけ。
    follow: params.get('follow') === 'on',
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
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [snakeDraft, setSnakeDraft] = useState(false);
  const [soundOn, setSoundOn] = useSoundEnabled();
  const [replay, setReplay] = useState<ReplayRecord | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
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
    return <LocalGame key={`${game.seed}-${game.log.length}`} initial={game} settings={settings} onRestart={() => setGame(null)} />;
  }
  if (replay !== null) {
    return (
      <ReplayViewer
        record={replay}
        settings={settings}
        onLeave={() => setReplay(null)}
        onContinue={(state) => {
          setReplay(null);
          setGame(state);
        }}
      />
    );
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
      <div className="start-row read-row">
        <RulesButton />
        {(
          [
            ['cards', 'カード一覧'],
            ['characters', 'キャラクター一覧'],
            ['boards', 'ボード一覧'],
          ] as const
        ).map(([view, label]) => (
          <button key={view} type="button" className="btn" data-ui={`open-catalog-${view}`} onClick={() => setCatalog(view)}>
            {label}
          </button>
        ))}
      </div>
      {catalog !== null ? <Catalog initial={catalog} onClose={() => setCatalog(null)} /> : null}
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
        <span title="オンライン版で、他の人の手番になったらその人のタブに切り替える">追いかける（オンライン）</span>
        <button type="button" className={`btn${settings.follow ? ' active' : ''}`} onClick={() => setSettings({ ...settings, follow: !settings.follow })}>
          {settings.follow ? '入' : '切'}
        </button>
        <span>手番の音</span>
        <button
          type="button"
          className={`btn${soundOn ? ' active' : ''}`}
          data-ui="start-sound"
          onClick={() => {
            setSoundOn(!soundOn);
            if (!soundOn) playTurnChime();
          }}
        >
          {soundOn ? '入' : '切'}
        </button>
      </div>
      <div className="start-row">
        <span>ヴァリアント</span>
        <label className="variant-toggle">
          <input type="checkbox" data-ui="variant-snake" checked={snakeDraft} onChange={(e) => setSnakeDraft(e.target.checked)} />
          スネークドラフト（準備のドラフトで、2巡目だけ選ぶ順番が逆になる。スイーツランドと同じ）
        </label>
      </div>
      <button type="button" className="btn primary" data-target="start" onClick={() => setGame(createGame({ playerCount: players, ...(snakeDraft ? { variants: { snakeDraft: true } } : {}) }, seed))}>
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
      <div className="start-row replay-row">
        <label className="btn" data-ui="load-replay">
          記録を再生する
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file === undefined) return;
              setReplayError(null);
              readReplayFile(file)
                .then(setReplay)
                .catch((error: unknown) => setReplayError(error instanceof Error ? error.message : String(error)));
            }}
          />
        </label>
        <span className="muted">「記録を保存」で保存したファイル（対話プレイの記録も同じ形）を読み込み、1手ずつ見たり、途中の局面から続きを遊んだりできる。</span>
        {replayError !== null ? (
          <span className="error" data-ui="load-replay-error">
            {replayError}
          </span>
        ) : null}
      </div>
      {transport !== null ? <OnlineEntry transport={transport} onEnter={setSession} /> : null}
      {/* 画面の版（2026-11-09）：古い画面のまま開いていないかを見分ける（ブラウザに古い版が残ると、更新前の値で遊んでしまう）。 */}
      <p className="muted small build-id" data-ui="build-id">
        版 {String(import.meta.env['VITE_BUILD_ID'] ?? 'local').slice(0, 7)}・データ {DATA_VERSION.slice(0, 6)}
      </p>
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
