// プロンプト帯（ui_design.md 3-1）と、値を決めるパネル（2-3-1）。
// 左に場面のアイコンと見出し、中央に選択中の値と値の選択肢、右に確定・パス・フリーアクションのボタンを出す。

import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import { describeScript, type IconToken } from '../game/icons.ts';
import { expeditionTable, pendingBuildCost, remainingInTask, sceneOf } from '../game/queries.ts';
import { playerOf } from '../game/core.ts';
import type { GameState, Option, Task } from '../game/types.ts';
import type { Building } from '../data/types.ts';
import { Icon, IconRow } from './Icon.tsx';
import type { Choice, UiModel } from './model.ts';
import { Tip } from './Tip.tsx';

const entry = (section: keyof typeof ICON_KEYS, key: string): { icon: string; label: string } =>
  (ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>)[key] ?? { icon: `${section}.${key}`, label: key };

const tok = (section: keyof typeof ICON_KEYS, key: string, value?: number | string): IconToken => {
  const e = entry(section, key);
  return value === undefined ? { icon: e.icon, label: e.label } : { icon: e.icon, value, label: e.label };
};

type Choose = (optionId: string) => void;

const topTask = (state: GameState): Task | undefined => state.stack[state.stack.length - 1];

/** パネルの選択肢を、アイコンと数字で表す。 */
const panelTokens = (state: GameState, choice: Choice): IconToken[] => {
  const t = choice.target;
  if (t.kind !== 'panel') return [];
  const task = topTask(state);
  switch (t.panel) {
    case 'workers':
      return [tok('resources', 'tempWorkers', Number(t.value))];
    case 'count':
      // 傭兵団：払った金の分だけトークンが戻る（支払いは矢の左に置く）。
      if (task?.t === 'tokenSwap') {
        const k = Number(t.value);
        return k === 0 ? [{ icon: 'sym.none', label: '替えない' }] : [tok('resources', 'gold', k * task.rate), tok('symbols', 'then'), tok('resources', 'militaryTokens', k)];
      }
      // 教練・福祉の組（ユーザー決定 2026-11-07）：払うものを矢の左、得るものを右に置く。
      if (task?.t === 'actionChoice') {
        const i = Number(t.value);
        if (task.action === 'drill') {
          const c = GAME_DATA.params.actions.drill[task.tier].choices[i];
          return c === undefined ? [] : [tok('resources', 'gold', c.payGold), tok('symbols', 'then'), tok('resources', 'militaryTokens', c.gainTokens)];
        }
        const c = GAME_DATA.params.actions.welfare[task.tier].choices[i];
        return c === undefined ? [] : [tok('resources', 'materials', c.payMaterials), tok('symbols', 'then'), tok('tracks', 'infra', `+${c.infra}`)];
      }
      return [{ icon: 'num', value: Number(t.value), label: t.value }];
    case 'convert':
      return t.value === '1' ? [tok('resources', 'tempWorkers', 1), tok('symbols', 'then'), tok('resources', 'materials')] : [{ icon: 'sym.none', label: 'しない' }];
    case 'raid': {
      if (t.value === 'none') return [{ icon: 'sym.none', label: '宣言しない' }];
      if (t.value === 'skip') return [tok('modifiers', 'skipRaid')];
      return [tok('metrics', t.value === 'defense' ? 'defenseLine' : 'repelLine', t.value === 'defense' ? state.defenseLine : state.repelLine)];
    }
    case 'reward': {
      const p = task && 'player' in task ? playerOf(state, task.player) : undefined;
      const row = p ? expeditionTable(GAME_DATA, p)[Number(t.value)] : undefined;
      if (row === undefined) return [];
      const grants = row.grants.map((g) => tok(g.kind === 'buildRight' ? 'commands' : g.kind === 'landTiles' ? 'commands' : 'resources', g.kind === 'buildRight' ? 'build' : g.kind === 'landTiles' ? 'placeTiles' : g.kind === 'freeBuildOnTerrain' ? 'points' : g.kind, g.amount));
      const command = row.command?.op === 'gain' ? [tok('resources', row.command.res, typeof row.command.amount === 'number' ? row.command.amount : '')] : [];
      return [tok('tracks', 'military', row.level), ...grants, ...command];
    }
    case 'copy': {
      const [action = '', tier = ''] = t.value.split(':');
      return [{ icon: `act.${action}`, label: action }, tok('tiers', tier)];
    }
    case 'order':
    case 'choose':
      return [{ icon: 'sym.item', label: choice.option.label }];
  }
};

const panelTip = (state: GameState, choice: Choice): string => {
  const task = topTask(state);
  if (choice.target.kind === 'panel' && choice.target.panel === 'choose' && task?.t === 'chooseOne') {
    const commands = task.options[Number(choice.target.value)] ?? [];
    return describeScript([{ ability: 'onPlay', do: commands }])[0]?.replace(/^[^：]*：/, '') ?? choice.option.label;
  }
  return choice.option.label;
};

export const PromptBar = ({
  state,
  model,
  onChoose,
  chooser,
  onCancelChooser,
  buildType,
  onBuildType,
  freeOpen,
  onToggleFree,
  turn,
  showHand,
}: {
  state: GameState;
  model: UiModel;
  onChoose: Choose;
  chooser: readonly Choice[] | null;
  onCancelChooser: () => void;
  buildType: Building | null;
  onBuildType: (b: Building) => void;
  freeOpen: boolean;
  onToggleFree: () => void;
  /** いま選ぶ人（手番）。mine はこの画面の持ち主が選ぶか（ローカル版は常に真）。 */
  turn: { name: string; color: string; mine: boolean; online: boolean } | null;
  /** 表示中のタブが手札の持ち主か。偽なら手札の内容（文明カードを捨てる変換のカード名）を出さない。 */
  showHand: boolean;
}) => {
  const scene = sceneOf(state);
  const panelChoices = model.choices.filter((c) => c.target.kind === 'panel');
  const pass = model.button('pass');
  const end = model.button('end');
  const done = model.button('done');
  const cost = pendingBuildCost(state);
  const remaining = remainingInTask(state);
  const buildTypes = [
    ...new Set(model.choices.flatMap((c) => (c.target.kind === 'cell' && c.target.variantKind === 'building' && c.target.variant ? [c.target.variant] : []))),
  ] as Building[];
  return (
    <div className="prompt" data-scene={scene.heading} style={turn !== null ? { ['--pc' as string]: turn.color } : undefined}>
      {turn !== null ? (
        <span className={`prompt-turn${turn.mine ? '' : ' waiting'}`} data-ui="prompt-turn">
          <span className="worker-dot" style={{ background: turn.color }} />
          {turn.online && turn.mine ? 'あなたの番' : `${turn.name}の番`}
          {turn.mine ? null : <span className="prompt-turn-wait">（待っています）</span>}
        </span>
      ) : null}
      <div className="prompt-left">
        <Icon token={{ icon: scene.icon, label: scene.heading }} />
        <span className="prompt-heading">{scene.heading}</span>
        {remaining !== null ? <span className="muted">残り{remaining}</span> : null}
        {cost !== null ? <IconRow tokens={[tok('resources', 'gold', -cost.gold), tok('resources', 'materials', -cost.materials)]} size="sm" /> : null}
      </div>
      <div className="prompt-center">
        {buildTypes.length > 0 ? (
          <span className="chooser">
            {buildTypes.map((b) => (
              <button
                key={b}
                type="button"
                className={`btn pen${buildType === b ? ' active' : ''}`}
                data-target={`pen:${b}`}
                onClick={() => onBuildType(b)}
              >
                <Icon token={tok('buildings', b)} />
              </button>
            ))}
          </span>
        ) : null}
        {chooser !== null ? (
          <span className="chooser">
            {chooser.map((c) => (
              <button key={c.option.id} type="button" className="btn selectable" data-target={c.option.id} onClick={() => onChoose(c.option.id)}>
                {c.target.kind === 'cell' && c.target.variant ? (
                  c.target.variantKind === 'terrain' ? (
                    <Icon token={tok('terrains', c.target.variant)} />
                  ) : (
                    <Icon token={tok('terrains', 'match', c.target.variant)} />
                  )
                ) : (
                  c.option.label
                )}
              </button>
            ))}
            <button type="button" className="btn" data-ui="cancel-chooser" onClick={onCancelChooser}>
              戻る
            </button>
          </span>
        ) : null}
        {panelChoices.map((c) => (
          <Tip key={c.option.id} text={panelTip(state, c)}>
            <button type="button" className="btn selectable" data-target={c.option.id} onClick={() => onChoose(c.option.id)}>
              <IconRow tokens={panelTokens(state, c)} size="sm" />
            </button>
          </Tip>
        ))}
        {model.fallback.length > 0 ? (
          <span className="fallback">
            その他：
            {model.fallback.map((o: Option) => (
              <button key={o.id} type="button" className="btn" data-fallback={o.id} onClick={() => onChoose(o.id)}>
                {o.label}
              </button>
            ))}
          </span>
        ) : null}
      </div>
      <div className="prompt-right">
        {done ? (
          <button type="button" className="btn primary selectable" data-target={done.id} onClick={() => onChoose(done.id)}>
            確定
          </button>
        ) : null}
        {end ? (
          <button type="button" className="btn primary selectable" data-target={end.id} onClick={() => onChoose(end.id)}>
            手番を終える
          </button>
        ) : null}
        {model.conversions.length > 0 ? (
          <button type="button" className={`btn${freeOpen ? ' active' : ''}`} data-target="free-panel" onClick={onToggleFree}>
            フリーアクション
          </button>
        ) : null}
        {pass ? (
          <button type="button" className="btn selectable" data-target={pass.id} onClick={() => onChoose(pass.id)}>
            パス
          </button>
        ) : null}
      </div>
      {freeOpen && model.conversions.length > 0 ? <ConversionPanel model={model} onChoose={onChoose} showHand={showHand} /> : null}
    </div>
  );
};

/** フリーアクションの資源変換（10-1-3）。1行が1回の変換。 */
const ConversionPanel = ({ model, onChoose, showHand }: { model: UiModel; onChoose: Choose; showHand: boolean }) => {
  return (
    <div className="free-panel">
      {model.conversions.map((c) => {
        const t = c.target;
        if (t.kind !== 'conversion') return null;
        // 捨てるカードを選ぶ変換は手札の内容を見せるため、持ち主のタブを表示しているときだけ出す。
        if (t.card !== null && !showHand) return null;
        const conv = GAME_DATA.params.freeActions.conversions.find((x) => x.id === t.id);
        if (conv === undefined) return null;
        const payKey = conv.pay.kind === 'civCards' ? 'drawCivCards' : conv.pay.kind;
        const tokens: IconToken[] = [
          tok('resources', payKey, conv.pay.amount),
          tok('symbols', 'then'),
          tok('resources', conv.gain.kind === 'drawCivCards' ? 'drawCivCards' : conv.gain.kind, conv.gain.amount),
        ];
        return (
          <button key={c.option.id} type="button" className="btn selectable" data-target={c.option.id} onClick={() => onChoose(c.option.id)}>
            <IconRow tokens={tokens} size="sm" />
            {t.card !== null ? (
              <span className="muted small" data-hand-card={t.card} data-owner={String(model.owner)}>
                {GAME_DATA.civilizationCards.find((x) => x.id === t.card)?.name}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
