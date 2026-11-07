// アクションボード（ui_design.md 1-3）。10アクション×3段階の格子。

import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import { ACTIONS, TIERS, type Action, type Tier } from '../data/types.ts';
import { explain } from '../game/explain.ts';
import { actionSpaceIcons, describeActionSpace, describeExpeditionRewards, isSharedSpace, isTopUnlocked, spaceUsers, unlockIcons } from '../game/queries.ts';
import type { GameState } from '../game/types.ts';
import { Icon, IconRow } from './Icon.tsx';
import { ICON_ART } from './icon-art.ts';
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
          <span key={tier} className="ab-tier" data-tier={tier}>
            {tierLabel(tier)}・{GAME_DATA.params.actions.workerCost[tier]}人
          </span>
        ))}
      </div>
      {ACTIONS.map((action) => (
        <div key={action} className="ab-row" data-action={action}>
          {/* アクションの名前はアイコンで示す（ユーザー決定 2026-11-06）。名前はカーソルを合わせると出し、読み上げにも渡す。 */}
          <span className="ab-action" aria-label={ACTION_LABELS[action]}>
            <span className="ab-action-badge">
              <Icon token={{ icon: `act.${action}`, label: ACTION_LABELS[action] }} />
            </span>
          </span>
          {TIERS.map((tier) => {
            const option = model.find((t) => t.kind === 'actionSpace' && t.action === action && t.tier === tier);
            const locked = tier === 'top' && owner !== undefined && !isTopUnlocked(GAME_DATA, owner, action);
            const users = spaceUsers(state, action, tier);
            const shared = isSharedSpace(action, tier);
            const reason = option !== undefined ? null : model.waiting ? WAITING_REASON : explain(state, { kind: 'actionSpace', action, tier });
            return (
              <Tip
                key={tier}
                text={`${ACTION_LABELS[action]}（${tierLabel(tier)}）：${describeActionSpace(action, tier)}${
                  // 遠征は報酬表も添える（ユーザー決定 2026-11-07）。指揮官の追加報酬も含める。
                  action === 'expedition' ? `\n${describeExpeditionRewards(owner ?? null)}` : ''
                }${reason !== null ? `\n${reason}` : ''}`}
              >
                <button
                  type="button"
                  className={`ab-space${shared ? ' ab-shared' : ''}${option ? ' selectable' : ' disabled'}`}
                  data-tier={tier}
                  aria-disabled={option === undefined}
                  {...(option ? { 'data-target': option.id } : {})}
                  onClick={() => option && onChoose(option.id)}
                >
                  <IconRow tokens={actionSpaceIcons(action, tier)} size="sm" />
                  {locked ? (
                    <span className="ab-lock">
                      <span className="lock-mark" aria-label="解放条件">
                        <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_ART['sym.lock'] ?? '' }} />
                      </span>
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
