// オンライン版の入口と対局画面（段階5）。ルームコードと名前で入り、席を固定して遊ぶ。

import { useEffect, useState } from 'react';
import { GAME_DATA } from '../data/index.ts';
import { decider } from '../game/engine.ts';
import { explainUndo } from '../game/explain.ts';
import {
  createRoomOnServer,
  forgetSession,
  joinRoomOnServer,
  loadSessions,
  saveSession,
  sendMove,
  sendUndo,
  subscribe,
  type RoomMessage,
  type Session,
} from '../online/client.ts';
import { Game, type GameController, type Settings } from './Game.tsx';

/** 部屋を作る・入る・続きから（ルームコード＋名前、ユーザー決定 2026-11-03）。 */
export const OnlineEntry = ({ onEnter }: { onEnter: (session: Session) => void }) => {
  const [name, setName] = useState('');
  const [players, setPlayers] = useState(GAME_DATA.params.playerCount.min);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState(loadSessions);

  const enter = (result: { code: string; seat: number; key: string }): void => {
    const session: Session = { ...result, name };
    saveSession(session);
    onEnter(session);
  };

  return (
    <section className="online-entry">
      <h2>オンライン</h2>
      <div className="start-row">
        <span>名前</span>
        <input data-ui="online-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="start-row">
        <span>部屋を作る</span>
        {Array.from(
          { length: GAME_DATA.params.playerCount.max - GAME_DATA.params.playerCount.min + 1 },
          (_, i) => GAME_DATA.params.playerCount.min + i,
        ).map((n) => (
          <button key={n} type="button" className={`btn${players === n ? ' active' : ''}`} data-ui={`online-players-${n}`} onClick={() => setPlayers(n)}>
            {n}人
          </button>
        ))}
        <button
          type="button"
          className="btn primary"
          data-ui="online-create"
          onClick={() => createRoomOnServer(players, name).then(enter, (e: unknown) => setError(String(e)))}
        >
          作る
        </button>
      </div>
      <div className="start-row">
        <span>部屋に入る</span>
        <input data-ui="online-code" value={code} placeholder="ルームコード" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button
          type="button"
          className="btn primary"
          data-ui="online-join"
          onClick={() => joinRoomOnServer(code, name).then(enter, (e: unknown) => setError(String(e)))}
        >
          入る
        </button>
      </div>
      {sessions.length > 0 ? (
        <div className="start-row">
          <span>続きから</span>
          {sessions.map((s) => (
            <span key={s.code} className="session">
              <button type="button" className="btn" data-ui={`online-resume-${s.code}`} onClick={() => onEnter(s)}>
                {s.code}（{s.name}）
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  forgetSession(s.code);
                  setSessions(loadSessions());
                }}
              >
                忘れる
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {error ? <p className="error">{error.replace(/^Error: /, '')}</p> : null}
    </section>
  );
};

/** オンライン版の対局。局面はサーバーの知らせで更新し、選択は送るだけで手元では適用しない。 */
export const OnlineGame = ({ session, settings, onLeave }: { session: Session; settings: Settings; onLeave: () => void }) => {
  const [message, setMessage] = useState<RoomMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => subscribe(session, (m) => setMessage(m), setConnected), [session]);

  const state = message?.state ?? null;
  if (message === null || state === null) {
    return (
      <div className="start" data-ui="lobby">
        <h1>部屋 {session.code}</h1>
        <p className="muted">{connected ? 'サーバーにつながっている' : 'サーバーに接続しています…'}</p>
        <p>
          ルームコード <strong data-ui="room-code">{session.code}</strong> を他のプレイヤーに伝え、全員がそろうと始まる。
        </p>
        {message ? (
          <ol>
            {Array.from({ length: message.summary.playerCount }, (_, i) => (
              <li key={i}>{message.summary.names[i] ?? '（空席）'}</li>
            ))}
          </ol>
        ) : null}
        <button type="button" className="btn" onClick={onLeave}>
          戻る
        </button>
      </div>
    );
  }

  const run = (action: () => Promise<unknown>): void => {
    setBusy(true);
    setNotice(null);
    action()
      .catch((e: unknown) => setNotice(String(e).replace(/^Error: /, '')))
      .finally(() => setBusy(false));
  };

  const mine = decider(state) === session.seat;
  const ctl: GameController = {
    state,
    seat: session.seat,
    choose: (id) => run(() => sendMove(session, id, state.log.length)),
    undo: () => run(() => sendUndo(session)),
    // チェックポイントの後でなければ、直前の選択をしたのは選択待ちの席である（手番の交代はチェックポイント）。
    undoReason: explainUndo(state) ?? (mine ? null : '直前の選択をした席だけが取り消せる'),
    busy,
    message: !connected ? 'サーバーとの接続が切れた。繋ぎ直しています…' : notice,
  };
  return <Game ctl={ctl} settings={settings} onRestart={onLeave} />;
};
