// ゲームロジックの公開窓口。
export { applyMove, createGame, decider, getOptions, isGameOver } from './engine.ts';
export { finalScores, type FinalScore } from './scoring.ts';
export { isCheckpoint, replay, undoLast } from './history.ts';
export type { GameConfig, GameEvent, GameState, Option, PlayerState, Task } from './types.ts';
export { describeScript, iconSequence, type IconToken } from './icons.ts';
