// ローカル版のゲーム画面（ui_design.md 1〜6）。1台で交代して遊ぶ。
// 画面の持ち主は選択待ちのプレイヤーに自動で合わせ、他のプレイヤーの手札の内容は画面にも DOM にも出さない（19-6-1）。

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CellId } from '../game/board.ts';
import { applyMove, isGameOver } from '../game/engine.ts';
import { explain, explainUndo } from '../game/explain.ts';
import { undoLast } from '../game/history.ts';
import { pendingPicks } from '../game/queries.ts';
import type { GameEvent, GameState } from '../game/types.ts';
import { DeltaChips, RoundSummary, sumDeltas } from './Motion.tsx';
import type { Building } from '../data/types.ts';
import { ActionBoard } from './ActionBoard.tsx';
import { DraftView, FinalScores, HandArea, PlayerStatus, SharedArea } from './Areas.tsx';
import { Board, type CellState } from './Board.tsx';
import { buildModel, colorOf, type Choice } from './model.ts';
import { PromptBar } from './PromptBar.tsx';
import { Tip } from './Tip.tsx';

export type Settings = { speed: 'standard' | 'fast' | 'none'; follow: boolean };


export const Game = ({ initial, settings, onRestart }: { initial: GameState; settings: Settings; onRestart: () => void }) => {
  const [state, setState] = useState(initial);
  const model = useMemo(() => buildModel(state), [state]);
  const owner = model.owner;
  const [view, setView] = useState<number>(owner ?? 0);
  const [chooser, setChooser] = useState<Choice[] | null>(null);
  const [buildType, setBuildType] = useState<Building | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [pane, setPane] = useState<'shared' | 'personal'>('shared');
  /** 直前の選択で増えた出来事（演出の材料、ui_design.md 4節）。 */
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([]);
  const [summary, setSummary] = useState<number | null>(null);
  const [focus, setFocus] = useState<CellId | null>(null);

  // 選択待ちの持ち主が変わったら、持ち主のタブへ戻す（ui_design.md 2-1、2-2、6-2）。
  useEffect(() => {
    if (owner !== null && (settings.follow || owner !== view)) setView(owner);
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
      const next = applyMove(state, optionId);
      const added = next.events.slice(state.events.length);
      setLastEvents(added);
      setFocus(null);
      // ラウンドの区切りを1画面で見せる（ui_design.md 4-3）。演出「なし」では出さない。
      const started = added.find((e) => e.type === 'round');
      if (started?.type === 'round' && settings.speed !== 'none') setSummary(started.round);
      setState(next);
      setChooser(null);
      setBuildType(null);
      setFreeOpen(false);
    },
    [state, settings.speed],
  );

  const undoReason = explainUndo(state);
  const undo = (): void => {
    const back = undoLast(state);
    if (back !== null) {
      setState(back);
      setLastEvents([]);
      setChooser(null);
    }
  };

  const viewed = state.players[view] ?? state.players[0];
  if (viewed === undefined) return null;
  const isOwnerView = owner === view;
  // 直前の選択で置かれた土地・建物を強調する（ui_design.md 4-1 手順3）。
  const freshCells = new Set(
    lastEvents.flatMap((e) => ((e.type === 'tilePlaced' || e.type === 'built') && e.player === view ? [e.cell] : [])),
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

  return (
    <div className={`game ${compactClass}`} data-owner={owner ?? ''} data-view={view} data-speed={settings.speed}>
      <header className="topbar">
        <span className="round">
          {state.phase === 'draft' ? 'ドラフト' : `第${state.round}ラウンド`}
          {state.phase === 'raid' ? '・襲撃' : ''}
        </span>
        <nav className="tabs">
          {state.turnOrder.map((p) => {
            const player = state.players[p];
            if (player === undefined) return null;
            return (
              <button
                key={p}
                type="button"
                data-ui={`tab-${p}`}
                className={`tab${p === view ? ' active' : ''}${p === owner ? ' turn' : ''}`}
                style={{ borderColor: colorOf(p) }}
                onClick={() => setView(p)}
              >
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
        <Tip text={undoReason}>
          <button type="button" className="btn" data-ui="undo" aria-disabled={undoReason !== null} disabled={undoReason !== null} onClick={undo}>
            取り消し
          </button>
        </Tip>
      </header>

      <main className="layout">
        <section className="col-left">
          <ActionBoard state={state} model={model} viewer={owner ?? view} onChoose={choose} />
        </section>
        <section className="col-center">
          {state.stack[state.stack.length - 1]?.t === 'draftPick' ? (
            <DraftView state={state} model={model} onChoose={choose} />
          ) : (
            <>
              <Board
                player={viewed}
                cellState={cellState}
                pickOrder={(cell) => (isOwnerView && picks.includes(cell) ? picks.indexOf(cell) + 1 : null)}
                highlight={focus}
                fresh={freshCells}
                explainCell={(cell) => (isOwnerView ? explain(state, { kind: 'cell', cell, variantKind: null, variant: null }, view) : null)}
                onCell={onCell}
              />
              <DeltaChips key={state.log.length} changes={sumDeltas(lastEvents, viewed.index, ['move'])} speed={settings.speed} />
              <PlayerStatus player={viewed} lastEvents={lastEvents} speed={settings.speed} />
            </>
          )}
        </section>
        <section className="col-right">
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
        <section className="bottom">
          <HandArea state={state} player={viewed} isOwner={isOwnerView} model={model} onChoose={choose} />
        </section>
      </main>

      <PromptBar
        state={state}
        model={model}
        onChoose={choose}
        chooser={chooser}
        onCancelChooser={() => setChooser(null)}
        buildType={buildType}
        onBuildType={setBuildType}
        freeOpen={freeOpen}
        onToggleFree={() => setFreeOpen(!freeOpen)}
      />

      {summary !== null && !isGameOver(state) ? <RoundSummary state={state} round={summary} onClose={() => setSummary(null)} /> : null}
      {isGameOver(state) ? <FinalScores state={state} onRestart={onRestart} /> : null}
      <div className="rotate">横向きにしてください</div>
    </div>
  );
};
