// ゲームロジックの公開窓口。
export { applyMove, createGame, decider, getOptions, isGameOver } from './engine.ts';
export { finalScores, type FinalScore } from './scoring.ts';
export { isCheckpoint, replay, turnStartLength, undoLast, undoToTurnStart } from './history.ts';
export type { GameConfig, GameEvent, GameState, Option, PlayerState, Task } from './types.ts';
export { describeScript, iconSequence, type IconToken } from './icons.ts';
export { targetOf, type PanelKind, type Target } from './targets.ts';
export { explain, explainUndo } from './explain.ts';
export * as queries from './queries.ts';
export {
  parseReplay,
  REPLAY_FORMAT,
  replayDataChanged,
  ReplayError,
  replayPrefix,
  replayRecordOf,
  replayTo,
  type ReplayRecord,
  type ReplayStep,
  type ReplayTurn,
  replayTurns,
} from './replay.ts';
export { deltaText, eventText, eventTurns, turnDelta, turnSummary } from './narrate.ts';
