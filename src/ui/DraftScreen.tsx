// ドラフトの専用画面（ユーザー決定 2026-11-05：スイーツランドの準備のドラフトを参考にする）。
// - 上：選ぶ順番の帯（済み・いま・これから）と、各プレイヤーが選んだもののまとめ。
// - 中：種類ごとのタブ（個人ボード・ボーナスタイル・キャラクター）。いま選ぶ人が選び終えた種類は押せない。
//   個人ボードは地図そのもの、キャラクターは効果のアイコンと原本の文言、ボーナスタイルは効果と文言を並べる。
// - 下：画面の持ち主の手札など（ドラフトの前に配った文明カード）。
// - 「閉じて盤面を見る」で畳み、共有の場（特別な市民カード・計画都市など）を見られる。
// 選べるかどうかは getOptions（model）だけで決め、画面はルールを計算しない（ui_design.md 0-2）。

import { useState } from 'react';
import { GAME_DATA } from '../data/index.ts';
import { explain } from '../game/explain.ts';
import type { GameState, PlayerState } from '../game/types.ts';
import { HandArea } from './Areas.tsx';
import { BoardMap } from './Board.tsx';
import { BonusTileView, ScriptView } from './Cards.tsx';
import { IconRow } from './Icon.tsx';
import { colorOf, WAITING_REASON, type UiModel } from './model.ts';
import { Tip } from './Tip.tsx';
import type { IconToken } from '../game/icons.ts';
import { ICON_KEYS } from '../data/index.ts';

type Kind = 'board' | 'bonus' | 'character';
type Choose = (id: string) => void;

const KINDS: readonly Kind[] = ['board', 'bonus', 'character'];
const KIND_LABELS: Record<Kind, string> = { board: '個人ボード', bonus: 'ボーナスタイル', character: 'キャラクター' };

const boardName = (id: string): string => GAME_DATA.boards.find((b) => b.id === id)?.name ?? id;
const characterName = (id: string): string => GAME_DATA.characters.find((c) => c.id === id)?.name ?? id;

const pickedOf = (p: PlayerState, kind: Kind): string | null => {
  if (kind === 'board') return p.boardId === null ? null : boardName(p.boardId);
  if (kind === 'bonus') return p.bonusTile === null ? null : `${p.bonusTile}番`;
  return p.characterId === null ? null : characterName(p.characterId);
};

/** ドラフトの順番（rules.md 2-6-7：手番順の最後から逆順に選び、一巡したら再び最後から選ぶ）。 */
const pickOrder = (state: GameState): number[] => {
  const one = [...state.turnOrder].reverse();
  return [...one, ...one, ...one];
};

const picksDone = (state: GameState): number =>
  state.players.reduce((n, p) => n + KINDS.filter((k) => pickedOf(p, k) !== null).length, 0);

/** 誰がその候補を選んだか。選ばれていなければ null。 */
const takenBy = (state: GameState, kind: Kind, id: string): PlayerState | null =>
  state.players.find((p) => (kind === 'board' ? p.boardId === id : kind === 'bonus' ? String(p.bonusTile) === id : p.characterId === id)) ?? null;

const resourceToken = (kind: string, value: number): IconToken => {
  const entry = (ICON_KEYS.resources as Readonly<Record<string, { icon: string; label: string }>>)[kind] ?? { icon: `res.${kind}`, label: kind };
  return { icon: entry.icon, label: entry.label, value };
};

/** 個人ボードのマスボーナスの合計（地図の下に添える）。 */
const bonusTotals = (boardId: string): IconToken[] => {
  const board = GAME_DATA.boards.find((b) => b.id === boardId);
  const totals = new Map<string, number>();
  for (const sq of Object.values(board?.squares ?? {})) if (sq?.bonus) totals.set(sq.bonus.kind, (totals.get(sq.bonus.kind) ?? 0) + sq.bonus.amount);
  return [...totals.entries()].map(([k, n]) => resourceToken(k, n));
};

/** 候補1つの枠。選べるなら「選ぶ」ボタン（data-target）、選ばれていれば選んだ人、選べない理由は補足に出す。 */
const Candidate = ({
  state,
  model,
  kind,
  id,
  title,
  onChoose,
  children,
}: {
  state: GameState;
  model: UiModel;
  kind: Kind;
  id: string;
  title: string;
  onChoose: Choose;
  children: React.ReactNode;
}) => {
  const option = model.find((t) => t.kind === 'draft' && t.group === kind && t.id === id);
  const owner = takenBy(state, kind, id);
  const reason = option !== undefined || owner !== null ? null : model.waiting ? WAITING_REASON : explain(state, { kind: 'draft', group: kind, id });
  return (
    <article className={`draft-card draft-${kind}${owner ? ' taken' : ''}${option ? ' selectable-card' : ''}`} data-draft={`${kind}:${id}`}>
      <header className="draft-card-head">
        <strong>{title}</strong>
        {owner ? (
          <span className="draft-owner" style={{ borderColor: colorOf(owner.index) }}>
            <span className="worker-dot" style={{ background: colorOf(owner.index) }} />
            {owner.name}が選んだ
          </span>
        ) : null}
      </header>
      <div className="draft-card-body">{children}</div>
      {option ? (
        <button type="button" className="btn primary selectable draft-choose" data-target={option.id} onClick={() => onChoose(option.id)}>
          この{KIND_LABELS[kind]}を選ぶ
        </button>
      ) : !owner && reason ? (
        <Tip text={reason}>
          <span className="muted small draft-reason">{reason}</span>
        </Tip>
      ) : null}
    </article>
  );
};

const candidatesOf = (state: GameState, kind: Kind): string[] => {
  const taken = state.players.flatMap((p) => {
    const v = kind === 'board' ? p.boardId : kind === 'bonus' ? (p.bonusTile === null ? null : String(p.bonusTile)) : p.characterId;
    return v === null ? [] : [v];
  });
  const pool = kind === 'board' ? state.draftPool.boards : kind === 'bonus' ? state.draftPool.bonusTiles.map(String) : state.draftPool.characters;
  const all = new Set([...pool, ...taken]);
  // データの並び順で並べる（選ばれても位置が動かないように）。
  const order =
    kind === 'board' ? GAME_DATA.boards.map((b) => b.id) : kind === 'bonus' ? GAME_DATA.bonusTiles.map((t) => String(t.id)) : GAME_DATA.characters.map((c) => c.id);
  return order.filter((id) => all.has(id));
};

export const DraftScreen = ({
  state,
  model,
  picker,
  handPlayer,
  isOwner,
  onChoose,
  onFold,
}: {
  state: GameState;
  model: UiModel;
  /** いま選んでいるプレイヤー。 */
  picker: PlayerState;
  /** 手札の欄に出すプレイヤー（表示中のタブ）。手札の内容は isOwner のときだけ描く（19-6-1）。 */
  handPlayer: PlayerState;
  isOwner: boolean;
  onChoose: Choose;
  onFold: () => void;
}) => {
  const open = KINDS.filter((k) => pickedOf(picker, k) === null);
  const [tab, setTab] = useState<Kind>(open[0] ?? 'board');
  const shown = open.includes(tab) ? tab : (open[0] ?? 'board');
  const order = pickOrder(state);
  const done = picksDone(state);
  const mine = !model.waiting;

  return (
    <section className="draft-screen" data-ui="draft-screen" aria-label="ドラフト">
      <div className="draft-top">
        <div className="draft-heading">
          <h2>{mine ? `${picker.name}が選ぶ番：まだ選んでいない種類から1つ選ぶ` : `${picker.name}が選んでいる`}</h2>
          <button type="button" className="btn" data-ui="draft-fold" onClick={onFold}>
            閉じて盤面を見る
          </button>
        </div>
        <ol className="draft-order" aria-label="選ぶ順番">
          {order.map((seat, i) => (
            <li
              key={i}
              className={i < done ? 'done' : i === done ? 'now' : ''}
              style={{ ['--pc' as string]: colorOf(seat) }}
              title={state.players[seat]?.name ?? ''}
            >
              {state.players[seat]?.name}
            </li>
          ))}
        </ol>
        <div className="draft-picks">
          {state.turnOrder.map((i) => {
            const p = state.players[i];
            if (p === undefined) return null;
            return (
              <div key={i} className={`draft-pl${i === picker.index ? ' now' : ''}`}>
                <span className="worker-dot" style={{ background: colorOf(i) }} />
                <b>{p.name}</b>
                {KINDS.map((k) => (
                  <span key={k} className={`chip${pickedOf(p, k) ? ' got' : ''}`}>
                    {KIND_LABELS[k]}：{pickedOf(p, k) ?? '—'}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <div className="draft-tabs" role="tablist">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              data-ui={`draft-tab-${k}`}
              aria-selected={shown === k}
              className={`btn${shown === k ? ' active' : ''}`}
              disabled={!open.includes(k)}
              onClick={() => setTab(k)}
            >
              {KIND_LABELS[k]}
              {!open.includes(k) ? '（選択済み）' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className={`draft-grid draft-grid-${shown}`}>
        {shown === 'board'
          ? candidatesOf(state, 'board').map((id) => (
              <Candidate key={id} state={state} model={model} kind="board" id={id} title={boardName(id)} onChoose={onChoose}>
                <BoardMap boardId={id} />
                <div className="draft-board-foot">
                  <span className="muted small">マスボーナス計</span>
                  <IconRow tokens={bonusTotals(id)} size="sm" />
                </div>
              </Candidate>
            ))
          : null}
        {shown === 'bonus'
          ? candidatesOf(state, 'bonus').map((id) => {
              const tile = GAME_DATA.bonusTiles.find((t) => String(t.id) === id);
              return tile ? (
                <Candidate key={id} state={state} model={model} kind="bonus" id={id} title={`ボーナスタイル ${id}番`} onChoose={onChoose}>
                  <BonusTileView tile={tile} />
                  <p className="draft-text">{tile.text}</p>
                </Candidate>
              ) : null;
            })
          : null}
        {shown === 'character'
          ? candidatesOf(state, 'character').map((id) => {
              const c = GAME_DATA.characters.find((x) => x.id === id);
              return c ? (
                <Candidate key={id} state={state} model={model} kind="character" id={id} title={c.name} onChoose={onChoose}>
                  <p className="muted small draft-axis">
                    型：{c.label}／評価軸：{c.axis}
                  </p>
                  <ScriptView script={c.script} />
                  <ul className="draft-effects">
                    {c.effects.map((e, i) => (
                      <li key={i}>
                        {e.text}
                        {e.items && e.items.length > 0 ? (
                          <ul>
                            {e.items.map((item, j) => (
                              <li key={j}>{item}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Candidate>
              ) : null;
            })
          : null}
      </div>
      {shown === 'bonus' ? <p className="muted small draft-note">ボーナスタイルは、パスするときに返して場から選び直す（第1ラウンドの始めに効果をもらえる）。</p> : null}

      <div className="draft-hand">
        <HandArea state={state} player={handPlayer} isOwner={isOwner} model={model} onChoose={onChoose} />
      </div>
    </section>
  );
};
