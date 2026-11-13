// ゲーム画面（ui_design.md 1〜6）。状態と選択の送り先を GameController で受け取り、ローカル版とオンライン版で共用する。
// - ローカル版（seat＝null）：1台で交代して遊ぶ。画面の持ち主は選択待ちのプレイヤーに自動で合わせる（2-2）。
// - オンライン版（seat＝席の番号）：視点を自分の席に固定する。他の席の手番では選択肢を出さない（6-2）。
// どちらでも、画面の持ち主以外の手札の内容は画面にも DOM にも出さない（19-6-1）。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CellId } from '../game/board.ts';
import { applyMove, decider, isGameOver } from '../game/engine.ts';
import { irreversibleNotice } from './confirm.ts';
import { explain, explainUndo } from '../game/explain.ts';
import { undoLast, undoToTurnStart } from '../game/history.ts';
import { replayRecordOf } from '../game/replay.ts';
import { downloadReplay } from './replay-file.ts';
import { pendingPicks } from '../game/queries.ts';
import type { GameEvent, GameState } from '../game/types.ts';
import { DeltaChips, RoundSummary, sumDeltas } from './Motion.tsx';
import type { Building } from '../data/types.ts';
import { ActionBoard } from './ActionBoard.tsx';
import { FinalScores, HandArea, PersonalInfo, SharedArea } from './Areas.tsx';
import { DraftScreen } from './DraftScreen.tsx';
import { Board, type CellState } from './Board.tsx';
import { buildModel, colorOf, waitingModel, WAITING_REASON, type Choice } from './model.ts';
import { PromptBar } from './PromptBar.tsx';
import { LegendButton } from './Legend.tsx';
import { QuickRefButton } from './QuickRef.tsx';
import { playTurnChime, useSoundEnabled } from './sound.ts';
import { RulesButton } from './RulesDeck.tsx';
import { Tip } from './Tip.tsx';

export type Settings = {
  speed: 'standard' | 'fast' | 'none';
  follow: boolean;
  /** 取り消せない選択（ドラフト・パス・カードを引くなど）の前に確かめる（ユーザー決定 2026-11-12）。#confirm=off で切る（受け入れ検査）。 */
  confirm: boolean;
};

export type GameController = {
  readonly state: GameState;
  /** 画面の席。null はローカル版（選択待ちのプレイヤーに合わせる）。 */
  readonly seat: number | null;
  readonly choose: (optionId: string) => void;
  readonly undo: () => void;
  /** 手番の最初まで戻す（ユーザー決定 2026-11-08）。無ければボタンを出さない（チュートリアル）。 */
  readonly undoTurn?: () => void;
  readonly undoReason: string | null;
  /** 選択を送っている途中か（オンライン版）。 */
  readonly busy?: boolean;
  readonly message?: string | null;
  /** 記録（リプレイ）を保存する。無ければボタンを出さない（チュートリアル、ユーザー決定 2026-11-10）。 */
  readonly saveReplay?: () => void;
  /** 記録の再生中：選択肢を出さず、取り消しと手番の音を使わない。 */
  readonly readOnly?: boolean;
  /** 取り消せない選択の前に確かめるか（ローカル版・オンライン版。チュートリアルは案内に従うため使わない）。 */
  readonly confirmIrreversible?: boolean;
  /** 記録の再生中：どのタブでも手札の内容を見せる（終わった対局の記録のため、19-6-1 の対象外）。 */
  readonly revealAll?: boolean;
};

/** ローカル版：状態を手元で持ち、選択をその場で適用する。 */
export const LocalGame = ({ initial, settings, onRestart }: { initial: GameState; settings: Settings; onRestart: () => void }) => {
  const [state, setState] = useState(initial);
  const saveReplay = (): void => downloadReplay(replayRecordOf(state));
  const ctl: GameController = {
    state,
    seat: null,
    choose: (id) => setState((s) => applyMove(s, id)),
    undo: () => {
      const back = undoLast(state);
      if (back !== null) setState(back);
    },
    undoTurn: () => {
      const back = undoToTurnStart(state);
      if (back !== null) setState(back);
    },
    undoReason: explainUndo(state),
    // 1台で交代して遊ぶため、手札はもともと全員に見えている。いつでも保存できる。
    saveReplay,
    confirmIrreversible: true,
  };
  return <Game ctl={ctl} settings={settings} onRestart={onRestart} />;
};

export const Game = ({
  ctl,
  settings,
  onRestart,
  toolbar,
}: {
  ctl: GameController;
  settings: Settings;
  onRestart: () => void;
  /** 上部の帯の下に置く操作（記録の再生の操作帯）。 */
  toolbar?: ReactNode;
}) => {
  const state = ctl.state;
  // オンライン版では、自分の席の選択待ちのときだけ選択肢を出す。送信中と記録の再生中も出さない。
  const model = useMemo(
    () =>
      (ctl.seat !== null && decider(state) !== ctl.seat) || ctl.busy === true || ctl.readOnly === true ? waitingModel(state) : buildModel(state),
    [state, ctl.seat, ctl.busy, ctl.readOnly],
  );
  const owner = model.owner;
  const [view, setView] = useState<number>(ctl.seat ?? owner ?? decider(state) ?? 0);
  /** 手札を見せてよい席。ローカル版は選択待ちのプレイヤー、オンライン版は自分の席、記録の再生は表示中のタブ。 */
  const handOwner = ctl.revealAll === true ? view : (ctl.seat ?? owner);
  // 席が替わったら（記録の再生でプレイヤーを固定し直したとき）、その席のタブにする。オンライン版の席は替わらない。
  useEffect(() => {
    if (ctl.seat !== null) setView(ctl.seat);
  }, [ctl.seat]);
  const [chooser, setChooser] = useState<Choice[] | null>(null);
  const [buildType, setBuildType] = useState<Building | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [pane, setPane] = useState<'shared' | 'personal'>('shared');
  /** 直前の選択で増えた出来事（演出の材料、ui_design.md 4節）。 */
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([]);
  const [summary, setSummary] = useState<number | null>(null);
  const [focus, setFocus] = useState<CellId | null>(null);
  const [soundOn, setSoundOn] = useSoundEnabled();
  /** ドラフトの専用画面を畳んで盤面を見ているか。選ぶ人が変わると開き直す。 */
  const [draftFolded, setDraftFolded] = useState(false);
  const drafting = state.stack[state.stack.length - 1]?.t === 'draftPick';
  // 手番（いま選ぶ人）の席。上部のタブと下の帯で目立たせる（ユーザー決定 2026-11-06）。
  const turnSeat = isGameOver(state) ? null : ctl.seat !== null || ctl.readOnly === true ? decider(state) : owner;
  const draftPicker = drafting ? decider(state) : null;
  useEffect(() => setDraftFolded(false), [draftPicker]);

  // 直前の選択で増えた出来事を演出の材料にする（ui_design.md 4節）。取り消しで戻ったときは演出しない。
  const previous = useRef(state);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (state.log.length <= before.log.length) {
      setLastEvents([]);
      return;
    }
    const added = state.events.slice(before.events.length);
    setLastEvents(added);
    setFocus(null);
    // ラウンドの区切りを1画面で見せる（ui_design.md 4-3）。演出「なし」では出さない。
    const started = added.find((e) => e.type === 'round');
    if (started?.type === 'round' && settings.speed !== 'none' && ctl.readOnly !== true) setSummary(started.round);
    // 依存は状態の変化だけにする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // 表示するタブ（ui_design.md 2-1、2-2、6-2）。視点は勝手に変えない（ユーザー決定 2026-11-06）。
  // - ローカル版：手番の人が替わったときだけ、その人のタブにする（手札はそのタブでだけ見せるため）。
  //   同じ人の手番の間は、ほかのタブを見ていても戻さない。
  // - オンライン版：自分の席のまま動かさない。「追いかける」が入のときだけ、手番の人が替わるとその席を見せる。
  useEffect(() => {
    if (turnSeat === null) return;
    if (ctl.seat === null || settings.follow) setView(turnSeat);
    // 依存は手番の人の変化だけにする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnSeat]);

  // 手番が来たら音で知らせる（ユーザー決定 2026-11-06）。オンライン版は自分の席に手番が来たとき、
  // ローカル版は手番の人が替わったとき。最初に画面を開いたときは鳴らさない。
  const lastTurn = useRef(turnSeat);
  useEffect(() => {
    const before = lastTurn.current;
    lastTurn.current = turnSeat;
    if (turnSeat === null || turnSeat === before || ctl.readOnly === true) return;
    if (ctl.seat === null || turnSeat === ctl.seat) playTurnChime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnSeat]);

  useEffect(() => {
    // 縮退配置では、選択の対象がある側へ切り替える（1-4）。
    const sharedKinds = new Set(['actionSpace', 'bonusTile', 'specialCitizen', 'plannedCity']);
    const onShared = model.choices.some((c) => sharedKinds.has(c.target.kind));
    const onPersonal = model.choices.some((c) => ['cell', 'handCard', 'ability', 'specialSpace', 'draft'].includes(c.target.kind));
    if (onPersonal && !onShared) setPane('personal');
    else if (onShared && !onPersonal) setPane('shared');
    // 依存は状態の変化だけにする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const choose = useCallback(
    (optionId: string) => {
      // 取り消せない選択の前に確かめる（ユーザー決定 2026-11-12）。断ったら何もしない。
      if (ctl.confirmIrreversible === true && settings.confirm) {
        const text = irreversibleNotice(ctl.state, optionId);
        if (text !== null && !window.confirm(text)) return;
      }
      setChooser(null);
      setBuildType(null);
      setFreeOpen(false);
      ctl.choose(optionId);
    },
    [ctl, settings.confirm],
  );

  const undoReason = ctl.undoReason;
  const undo = (): void => {
    setChooser(null);
    ctl.undo();
  };

  const viewed = state.players[view] ?? state.players[0];
  if (viewed === undefined) return null;
  const isOwnerView = handOwner !== null && handOwner === view;
  // 直前の選択で置かれた土地・建物を強調する（ui_design.md 4-1 手順3）。
  const freshCells = new Set(
    lastEvents.flatMap((e) => ((e.type === 'tilePlaced' || e.type === 'built') && e.player === view && e.cell !== null ? [e.cell] : [])),
  );
  const picks = pendingPicks(state);

  const cellChoices = (cell: CellId): Choice[] => {
    if (!isOwnerView) return [];
    const all = model.cellChoices(cell);
    const building = all.filter((c) => c.target.kind === 'cell' && c.target.variantKind === 'building');
    if (building.length > 0) {
      // 建築：選んだ種類の建物だけを置ける（種類を選んでマスをタップ）。
      return buildType === null ? [] : building.filter((c) => c.target.kind === 'cell' && c.target.variant === buildType);
    }
    return all;
  };

  const cellState = (cell: CellId): CellState => {
    if (cellChoices(cell).length > 0) return 'selectable';
    if (isOwnerView && picks.includes(cell)) return 'picked';
    return 'none';
  };

  const onCell = (cell: CellId): void => {
    const choices = cellChoices(cell);
    const [only] = choices;
    if (choices.length === 1 && only !== undefined) choose(only.option.id);
    else if (choices.length > 1) setChooser(choices);
  };

  const compactClass = pane === 'shared' ? 'show-shared' : 'show-personal';
  const draftOpen = drafting && !draftFolded && draftPicker !== null;
  const picker = draftPicker !== null ? state.players[draftPicker] : undefined;

  return (
    <div
      className={`game ${compactClass}${draftOpen ? ' drafting' : ''}`}
      data-owner={handOwner ?? ''}
      data-view={view}
      data-speed={settings.speed}
      data-seat={ctl.seat ?? ''}
      data-turn={owner ?? ''}
    >
      <header className="topbar">
        <span className="round">
          {state.phase === 'draft' ? 'ドラフト' : `第${state.round}ラウンド`}
          {state.phase === 'raid' ? '・襲撃' : ''}
        </span>
        <nav className="tabs">
          {state.turnOrder.map((p) => {
            const player = state.players[p];
            if (player === undefined) return null;
            const isTurn = p === turnSeat;
            return (
              <button
                key={p}
                type="button"
                data-ui={`tab-${p}`}
                className={`tab${p === view ? ' active' : ''}${isTurn ? ' turn' : ''}${p === ctl.seat ? ' mine' : ''}`}
                style={{ borderColor: colorOf(p), ['--pc' as string]: colorOf(p) }}
                aria-current={isTurn ? 'true' : undefined}
                onClick={() => setView(p)}
              >
                {isTurn ? <span className="turn-flag">手番</span> : null}
                <span className="worker-dot" style={{ background: colorOf(p) }} />
                {player.name}
                <span className="tab-score">{player.score}点</span>
                <span className="muted small">手札{player.hand.length}</span>
                {player.passed ? <span className="passed">パス</span> : null}
              </button>
            );
          })}
        </nav>
        <button type="button" className="btn pane-toggle" data-ui="pane" onClick={() => setPane(pane === 'shared' ? 'personal' : 'shared')}>
          {pane === 'shared' ? '個人領域' : '共有の場'}
        </button>
        {drafting && draftFolded ? (
          <button type="button" className="btn primary" data-ui="draft-open" onClick={() => setDraftFolded(false)}>
            ドラフトを開く
          </button>
        ) : null}
        <RulesButton label="ルール" />
        <QuickRefButton state={state} viewer={view} />
        <LegendButton />
        <button
          type="button"
          className={`btn${soundOn ? '' : ' muted-btn'}`}
          data-ui="sound"
          aria-pressed={soundOn}
          title="手番が来たときの音"
          onClick={() => {
            setSoundOn(!soundOn);
            if (!soundOn) playTurnChime();
          }}
        >
          {soundOn ? '音：入' : '音：切'}
        </button>
        {ctl.saveReplay !== undefined ? (
          <Tip text="対局の記録（リプレイ）をファイルに保存する。トップページの「記録を再生する」で読み込める">
            <button type="button" className="btn" data-ui="save-replay" onClick={ctl.saveReplay}>
              記録を保存
            </button>
          </Tip>
        ) : null}
        {ctl.readOnly === true ? null : (
          <>
        <Tip text={undoReason}>
          <button type="button" className="btn" data-ui="undo" aria-disabled={undoReason !== null} disabled={undoReason !== null} onClick={undo}>
            取り消し
          </button>
        </Tip>
        {ctl.undoTurn !== undefined ? (
          <Tip text={undoReason ?? '手番の最初まで戻す（カードを引いた・特別な市民カードを獲得した選択の直後まで）'}>
            <button
              type="button"
              className="btn"
              data-ui="undo-turn"
              aria-disabled={undoReason !== null}
              disabled={undoReason !== null}
              onClick={() => {
                setChooser(null);
                ctl.undoTurn?.();
              }}
            >
              手番の最初へ
            </button>
          </Tip>
        ) : null}
          </>
        )}
      </header>
      {toolbar}

      {draftOpen && picker !== undefined ? (
        <main className="layout">
          <DraftScreen
            state={state}
            model={model}
            picker={picker}
            handPlayer={viewed}
            isOwner={isOwnerView}
            onChoose={choose}
            onFold={() => setDraftFolded(true)}
          />
        </main>
      ) : (
      <main className="layout">
        <section className="col-left">
          <ActionBoard state={state} model={model} viewer={handOwner ?? view} onChoose={choose} />
          <SharedArea
            state={state}
            model={model}
            onChoose={choose}
            onFocus={(cell, player) => {
              setFocus(cell);
              if (player !== null) setView(player);
            }}
          />
        </section>
        <section className="col-center">
          {drafting ? (
            <p className="muted draft-folded-note">ドラフト中である。上の「ドラフトを開く」で選ぶ画面に戻る。</p>
          ) : (
            <>
              <Board
                player={viewed}
                cellState={cellState}
                pickOrder={(cell) => (isOwnerView && picks.includes(cell) ? picks.indexOf(cell) + 1 : null)}
                highlight={focus}
                fresh={freshCells}
                explainCell={(cell) =>
                  model.waiting ? WAITING_REASON : isOwnerView ? explain(state, { kind: 'cell', cell, variantKind: null, variant: null }, view) : null
                }
                onCell={onCell}
              />
              <DeltaChips key={state.log.length} changes={sumDeltas(lastEvents, viewed.index, ['move'])} speed={settings.speed} />
            </>
          )}
        </section>
        <div className="personal-side">
          <section className="col-info">
            <PersonalInfo player={viewed} isOwner={isOwnerView} model={model} onChoose={choose} lastEvents={lastEvents} speed={settings.speed} />
          </section>
          <section className="bottom">
            <HandArea state={state} player={viewed} isOwner={isOwnerView} model={model} onChoose={choose} />
          </section>
        </div>
      </main>
      )}

      {ctl.message ? <div className="online-message">{ctl.message}</div> : null}
      <PromptBar
        state={state}
        turn={
          turnSeat !== null && state.players[turnSeat] !== undefined
            ? { name: state.players[turnSeat].name, color: colorOf(turnSeat), mine: ctl.seat === null || ctl.seat === turnSeat, online: ctl.seat !== null }
            : null
        }
        model={model}
        onChoose={choose}
        chooser={chooser}
        onCancelChooser={() => setChooser(null)}
        buildType={buildType}
        onBuildType={setBuildType}
        freeOpen={freeOpen}
        onToggleFree={() => setFreeOpen(!freeOpen)}
        showHand={handOwner !== null && view === handOwner}
      />

      {summary !== null && !isGameOver(state) ? <RoundSummary state={state} round={summary} onClose={() => setSummary(null)} /> : null}
      {isGameOver(state) ? <FinalScores state={state} onRestart={onRestart} {...(ctl.saveReplay !== undefined ? { onSaveReplay: ctl.saveReplay } : {})} {...(ctl.readOnly === true ? { restartLabel: '再生を閉じる' } : {})} /> : null}
      <div className="rotate">横向きにしてください</div>
    </div>
  );
};
