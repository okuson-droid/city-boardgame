// アクションボード（ui_design.md 1-3）。10アクション×3段階の格子。

import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import { ACTIONS, TIERS, type Action, type Tier } from '../data/types.ts';
import { explain } from '../game/explain.ts';
import { actionSpaceIcons, isSharedSpace, isTopUnlocked, spaceUsers, unlockIcons } from '../game/queries.ts';
import type { GameState } from '../game/types.ts';
import { IconRow } from './Icon.tsx';
import { colorOf, WAITING_REASON, type UiModel } from './model.ts';
import { Tip } from './Tip.tsx';

const ACTION_LABELS: Record<Action, string> = {
  pioneer: '開拓',
  build: '建築',
  import: '輸入',
  export: '輸出',
  drill: '教練',
  expedition: '遠征',
  welfare: '福祉',
  migration: '移住',
  research: '研究',
  spread: '普及',
};

const tierLabel = (tier: Tier): string => (ICON_KEYS.tiers as Readonly<Record<string, { label: string }>>)[tier]?.label ?? tier;

export const ActionBoard = ({
  state,
  model,
  viewer,
  onChoose,
}: {
  state: GameState;
  model: UiModel;
  viewer: number;
  onChoose: (optionId: string) => void;
}) => {
  const owner = state.players[viewer];
  return (
    <div className="action-board">
      <div className="ab-head">
        <span />
        {TIERS.map((tier) => (
          <span key={tier} className="ab-tier">
            {tierLabel(tier)}・{GAME_DATA.params.actions.workerCost[tier]}人
          </span>
        ))}
      </div>
      {ACTIONS.map((action) => (
        <div key={action} className="ab-row">
          <span className="ab-action">{ACTION_LABELS[action]}</span>
          {TIERS.map((tier) => {
            const option = model.find((t) => t.kind === 'actionSpace' && t.action === action && t.tier === tier);
            const locked = tier === 'top' && owner !== undefined && !isTopUnlocked(GAME_DATA, owner, action);
            const users = spaceUsers(state, action, tier);
            const shared = isSharedSpace(action, tier);
            const reason = option !== undefined ? null : model.waiting ? WAITING_REASON : explain(state, { kind: 'actionSpace', action, tier });
            return (
              <Tip key={tier} text={reason}>
                <button
                  type="button"
                  className={`ab-space${shared ? ' ab-shared' : ''}${option ? ' selectable' : ' disabled'}`}
                  aria-disabled={option === undefined}
                  {...(option ? { 'data-target': option.id } : {})}
                  onClick={() => option && onChoose(option.id)}
                >
                  <IconRow tokens={actionSpaceIcons(action, tier)} size="sm" />
                  {locked ? (
                    <span className="ab-lock">
                      <span className="lock-mark">鍵</span>
                      <IconRow tokens={unlockIcons(GAME_DATA.params.actions.unlockTop[action])} size="sm" />
                    </span>
                  ) : null}
                  <span className="ab-users">
                    {users.map((p, i) => (
                      <span key={i} className="worker-dot" style={{ background: colorOf(p) }} />
                    ))}
                  </span>
                </button>
              </Tip>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export { ACTION_LABELS };
