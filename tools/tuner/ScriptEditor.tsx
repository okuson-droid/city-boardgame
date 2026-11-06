// 効果スクリプトの編集（指示書 3-5）。命令と引数の単位で編集し、命令セットにない記述はできない。
// 選べる値は src/data/script.ts の一覧（能力・命令・資源・指標・出来事・補正）だけである。

import {
  ABILITY_NAMES,
  ACTIONS,
  BUILDINGS,
  CIV_TAGS,
  COMMAND_OPS,
  EVENT_NAMES,
  GAIN_RESOURCES,
  MODIFIER_KINDS,
  SCORE_AXES,
  SIMPLE_METRICS,
  TERRAINS,
  TIERS,
  type Ability,
  type Command,
} from '../../src/data/index.ts';
import { describeScript } from '../../src/game/icons.ts';
import { IconRow } from '../../src/ui/Icon.tsx';
import { iconSequence } from '../../src/game/icons.ts';
import { JsonEditor } from './JsonEditor.tsx';
import { keyLabel, valueLabel } from './labels.ts';

type J = Record<string, unknown>;

const METRICS: readonly string[] = [
  ...SIMPLE_METRICS,
  ...BUILDINGS.map((b) => `buildingsOfType:${b}`),
  ...TERRAINS.map((t) => `buildingsOnTerrain:${t}`),
];

// ---------------------------------------------------------------------------
// 雛形（種類を切り替えたときの初期値）
// ---------------------------------------------------------------------------

const COMMAND_TEMPLATES: Record<(typeof COMMAND_OPS)[number], Command> = {
  gain: { op: 'gain', res: 'gold', amount: 1 },
  raise: { op: 'raise', track: 'military', amount: 1 },
  placeTiles: { op: 'placeTiles', count: 1, tile: 'match' },
  build: { op: 'build', max: 1, upTo: false, buildings: null, terrain: null, payGold: true, payMaterials: true },
  playCard: { op: 'playCard', count: 1, free: true },
  expeditionRewards: { op: 'expeditionRewards', count: 1 },
  chooseOne: { op: 'chooseOne', options: [[{ op: 'gain', res: 'gold', amount: 1 }]] },
  if: { op: 'if', cond: { left: 'militaryLevel', op: '>=', right: 1 }, then: [{ op: 'gain', res: 'gold', amount: 1 }] },
  copyAction: { op: 'copyAction' },
  drawPlannedCity: { op: 'drawPlannedCity', count: 1 },
  spiritPlace: { op: 'spiritPlace' },
  heroStart: { op: 'heroStart' },
};

const ABILITY_TEMPLATES: Record<(typeof ABILITY_NAMES)[number], Ability> = {
  onPlay: { ability: 'onPlay', do: [] },
  onAcquire: { ability: 'onAcquire', do: [] },
  setup: { ability: 'setup', do: [] },
  firstTurnStart: { ability: 'firstTurnStart', do: [] },
  gameEnd: { ability: 'gameEnd', do: [] },
  on: { ability: 'on', event: 'cardPlayed', filter: {}, do: [] },
  freeAction: { ability: 'freeAction', pay: null, require: null, oncePerRound: true, do: [] },
  actionSpace: { ability: 'actionSpace', workers: 1, do: [] },
  modifier: { ability: 'modifier', modifier: { kind: 'regularWorkersImmediate' } },
};

const MODIFIER_TEMPLATES: Record<(typeof MODIFIER_KINDS)[number], J> = {
  buildCost: { kind: 'buildCost', building: 'house', materials: -1 },
  pioneerMismatchExtra: { kind: 'pioneerMismatchExtra', value: 0 },
  regularWorkersImmediate: { kind: 'regularWorkersImmediate' },
  goldPointsMultiplier: { kind: 'goldPointsMultiplier', value: 2 },
  natureParkPoints: { kind: 'natureParkPoints', table: { '2': 5, '3': 10, '4': 15 } },
  expeditionRewards: { kind: 'expeditionRewards', add: [] },
  noBuildOnSpiritLand: { kind: 'noBuildOnSpiritLand' },
};

// ---------------------------------------------------------------------------
// 入力欄
// ---------------------------------------------------------------------------

/** 選択欄。表示は日本語の名前（labels.ts）、保存する値は識別子のままである。kind は値の種類を表す項目名。 */
const Select = ({
  value,
  options,
  onChange,
  empty,
  kind = '',
}: {
  value: string | null | undefined;
  options: readonly string[];
  onChange: (v: string | null) => void;
  empty?: string;
  kind?: string;
}) => (
  <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
    {empty !== undefined ? <option value="">{empty}</option> : null}
    {options.map((o) => (
      <option key={o} value={o}>
        {valueLabel(o, kind)}
      </option>
    ))}
  </select>
);

const Int = ({ value, onChange }: { value: unknown; onChange: (v: number) => void }) => (
  <input type="number" className="int" value={typeof value === 'number' ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />
);

const Check = ({ value, onChange, label }: { value: unknown; onChange: (v: boolean) => void; label: string }) => (
  <label className="check">
    <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <span className="sfield">
    <span className="sfield-label">{label}</span>
    {children}
  </span>
);

/** 数（固定値、または「指標 per につき times」）。 */
const AmountEditor = ({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) => {
  if (typeof value === 'number') {
    return (
      <span>
        <Int value={value} onChange={onChange} />
        <button type="button" className="btn small" onClick={() => onChange({ count: 'regularWorkers', per: 1, times: 1 })}>
          指標につき
        </button>
      </span>
    );
  }
  const v = (value ?? {}) as J;
  return (
    <span>
      <Select value={String(v['count'])} kind="metric" options={METRICS} onChange={(c) => onChange({ ...v, count: c })} />
      <Int value={v['per']} onChange={(n) => onChange({ ...v, per: n })} />
      につき
      <Int value={v['times']} onChange={(n) => onChange({ ...v, times: n })} />
      <button type="button" className="btn small" onClick={() => onChange(1)}>
        固定値
      </button>
    </span>
  );
};

/** 条件（指標 比較 数または指標）。nullable なら「なし」を選べる。 */
const ConditionEditor = ({ value, onChange, nullable }: { value: unknown; onChange: (v: unknown) => void; nullable?: boolean }) => {
  if (value === null || value === undefined) {
    return (
      <button type="button" className="btn small" onClick={() => onChange({ left: 'militaryLevel', op: '>=', right: 1 })}>
        条件を付ける
      </button>
    );
  }
  const v = value as J;
  const right = v['right'];
  return (
    <span className="cond">
      <Select value={String(v['left'])} kind="left" options={METRICS} onChange={(l) => onChange({ ...v, left: l })} />
      <Select value={String(v['op'])} kind="compare" options={['>=', '<']} onChange={(o) => onChange({ ...v, op: o })} />
      {typeof right === 'number' ? (
        <Int value={right} onChange={(n) => onChange({ ...v, right: n })} />
      ) : (
        <Select value={String(right)} kind="right" options={METRICS} onChange={(m) => onChange({ ...v, right: m })} />
      )}
      <button type="button" className="btn small" onClick={() => onChange({ ...v, right: typeof right === 'number' ? 'repelLine' : 1 })}>
        {typeof right === 'number' ? '指標と比べる' : '数と比べる'}
      </button>
      {nullable ? (
        <button type="button" className="btn small" onClick={() => onChange(null)}>
          条件を外す
        </button>
      ) : null}
    </span>
  );
};

// ---------------------------------------------------------------------------
// 命令
// ---------------------------------------------------------------------------

const CommandEditor = ({ value, onChange }: { value: J; onChange: (v: J) => void }) => {
  const op = String(value['op']) as (typeof COMMAND_OPS)[number];
  const set = (key: string, v: unknown): void => onChange({ ...value, [key]: v });
  const unset = (key: string): void => {
    const { [key]: _removed, ...rest } = value;
    onChange(rest);
  };
  return (
    <div className="command">
      <Select value={op} kind="op" options={COMMAND_OPS} onChange={(o) => onChange({ ...COMMAND_TEMPLATES[o as (typeof COMMAND_OPS)[number]] })} />
      {op === 'gain' ? (
        <>
          <Field label="資源">
            <Select value={String(value['res'])} kind="res" options={GAIN_RESOURCES} onChange={(r) => set('res', r)} />
          </Field>
          <Field label="数">
            <AmountEditor value={value['amount']} onChange={(a) => set('amount', a)} />
          </Field>
          <Field label="評価軸">
            <Select value={value['axis'] as string | undefined} kind="axis" options={SCORE_AXES} empty="（既定）" onChange={(a) => (a === null ? unset('axis') : set('axis', a))} />
          </Field>
        </>
      ) : null}
      {op === 'raise' ? (
        <>
          <Field label="トラック">
            <Select value={String(value['track'])} kind="track" options={['military', 'infra']} onChange={(t) => set('track', t)} />
          </Field>
          <Field label="数">
            <AmountEditor value={value['amount']} onChange={(a) => set('amount', a)} />
          </Field>
        </>
      ) : null}
      {op === 'placeTiles' ? (
        <>
          <Field label="枚数">
            <Int value={value['count']} onChange={(n) => set('count', n)} />
          </Field>
          <Field label="種類">
            <Select value={String(value['tile'])} kind="tile" options={['match', 'any', ...TERRAINS]} onChange={(t) => set('tile', t)} />
          </Field>
        </>
      ) : null}
      {op === 'build' ? (
        <>
          <Field label="軒数">
            <Int value={value['max']} onChange={(n) => set('max', n)} />
          </Field>
          <Check label="まで" value={value['upTo']} onChange={(b) => set('upTo', b)} />
          <Field label="建物">
            <span className="checks">
              {BUILDINGS.map((b) => {
                const list = Array.isArray(value['buildings']) ? (value['buildings'] as string[]) : [];
                return (
                  <label key={b}>
                    <input
                      type="checkbox"
                      checked={list.includes(b)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...list, b] : list.filter((x) => x !== b);
                        set('buildings', next.length === 0 ? null : next);
                      }}
                    />
                    {valueLabel(b, 'building')}
                  </label>
                );
              })}
            </span>
          </Field>
          <Field label="地形">
            <Select value={value['terrain'] as string | null} kind="terrain" options={TERRAINS} empty="（任意）" onChange={(t) => set('terrain', t)} />
          </Field>
          <Check label="金を払う" value={value['payGold']} onChange={(b) => set('payGold', b)} />
          <Check label="資材を払う" value={value['payMaterials']} onChange={(b) => set('payMaterials', b)} />
        </>
      ) : null}
      {op === 'playCard' ? (
        <>
          <Field label="枚数">
            <Int value={value['count']} onChange={(n) => set('count', n)} />
          </Field>
          <Check label="まで" value={value['upTo']} onChange={(b) => (b ? set('upTo', true) : unset('upTo'))} />
          <Check label="無料" value={value['free']} onChange={(b) => set('free', b)} />
        </>
      ) : null}
      {op === 'expeditionRewards' || op === 'drawPlannedCity' ? (
        <Field label="数">
          <Int value={value['count']} onChange={(n) => set('count', n)} />
        </Field>
      ) : null}
      {op === 'if' ? (
        <div className="nested">
          <ConditionEditor value={value['cond']} onChange={(c) => set('cond', c)} />
          <span className="muted">なら</span>
          <CommandList value={(value['then'] as J[]) ?? []} onChange={(c) => set('then', c)} />
        </div>
      ) : null}
      {op === 'chooseOne' ? (
        <div className="nested">
          {((value['options'] as J[][]) ?? []).map((option, i, all) => (
            <div key={i} className="choice">
              <span className="muted">選択肢{i + 1}</span>
              <CommandList value={option} onChange={(c) => set('options', all.map((o, j) => (j === i ? c : o)))} />
              <button type="button" className="btn small" onClick={() => set('options', all.filter((_, j) => j !== i))}>
                選択肢を削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn small"
            onClick={() => set('options', [...((value['options'] as J[][]) ?? []), [{ ...COMMAND_TEMPLATES.gain }]])}
          >
            選択肢を追加
          </button>
        </div>
      ) : null}
    </div>
  );
};

const CommandList = ({ value, onChange }: { value: J[]; onChange: (v: J[]) => void }) => (
  <div className="command-list">
    {value.map((command, i) => (
      <div key={i} className="command-row">
        <CommandEditor value={command} onChange={(c) => onChange(value.map((x, j) => (j === i ? c : x)))} />
        <button type="button" className="btn small" onClick={() => onChange(value.filter((_, j) => j !== i))}>
          削除
        </button>
      </div>
    ))}
    <button type="button" className="btn small" onClick={() => onChange([...value, { ...COMMAND_TEMPLATES.gain }])}>
      命令を追加
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// 能力
// ---------------------------------------------------------------------------

const FILTER_FIELDS: { key: string; options: readonly string[] | 'bool' | 'cond' }[] = [
  { key: 'terrain', options: TERRAINS },
  { key: 'tag', options: CIV_TAGS },
  { key: 'excludeSelf', options: 'bool' },
  { key: 'tier', options: TIERS },
  { key: 'action', options: ACTIONS },
  { key: 'building', options: BUILDINGS },
  { key: 'kind', options: ['regular', 'temp'] },
  { key: 'result', options: ['defenseFailed', 'defended', 'repelled'] },
  { key: 'cond', options: 'cond' },
];

const FilterEditor = ({ value, onChange }: { value: J; onChange: (v: J) => void }) => {
  const set = (key: string, v: unknown): void => {
    const { [key]: _old, ...rest } = value;
    onChange(v === null || v === undefined || v === false ? rest : { ...rest, [key]: v });
  };
  return (
    <span className="filter">
      {FILTER_FIELDS.map(({ key, options }) => (
        <Field key={key} label={keyLabel(key)}>
          {options === 'bool' ? (
            <input type="checkbox" checked={value[key] === true} onChange={(e) => set(key, e.target.checked)} />
          ) : options === 'cond' ? (
            <ConditionEditor value={value[key]} onChange={(c) => set(key, c)} nullable />
          ) : (
            <Select value={value[key] as string | undefined} kind={key} options={options} empty="（指定なし）" onChange={(v) => set(key, v)} />
          )}
        </Field>
      ))}
    </span>
  );
};

const ModifierEditor = ({ value, onChange }: { value: J; onChange: (v: J) => void }) => {
  const kind = String(value['kind']) as (typeof MODIFIER_KINDS)[number];
  const set = (key: string, v: unknown): void => onChange({ ...value, [key]: v });
  return (
    <span className="modifier">
      <Select value={kind} kind="kind" options={MODIFIER_KINDS} onChange={(k) => onChange({ ...MODIFIER_TEMPLATES[k as (typeof MODIFIER_KINDS)[number]] })} />
      {kind === 'buildCost' ? (
        <>
          <Select value={String(value['building'])} kind="building" options={BUILDINGS} onChange={(b) => set('building', b)} />
          <Field label="資材">
            <Int value={value['materials']} onChange={(n) => set('materials', n)} />
          </Field>
        </>
      ) : null}
      {kind === 'pioneerMismatchExtra' || kind === 'goldPointsMultiplier' ? (
        <Field label="値">
          <Int value={value['value']} onChange={(n) => set('value', n)} />
        </Field>
      ) : null}
      {kind === 'natureParkPoints' ? (
        <JsonEditor value={value['table']} base={value['table']} path={[]} onSet={(_, v) => set('table', v)} />
      ) : null}
      {kind === 'expeditionRewards' ? (
        <div className="nested">
          {((value['add'] as J[]) ?? []).map((entry, i, all) => (
            <div key={i} className="command-row">
              <Field label="レベル">
                <Int value={entry['level']} onChange={(n) => set('add', all.map((x, j) => (j === i ? { ...x, level: n } : x)))} />
              </Field>
              <CommandEditor value={entry['command'] as J} onChange={(c) => set('add', all.map((x, j) => (j === i ? { ...x, command: c } : x)))} />
              <button type="button" className="btn small" onClick={() => set('add', all.filter((_, j) => j !== i))}>
                削除
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => set('add', [...((value['add'] as J[]) ?? []), { level: 0, command: { ...COMMAND_TEMPLATES.gain } }])}>
            報酬を追加
          </button>
        </div>
      ) : null}
    </span>
  );
};

const AbilityEditor = ({ value, onChange }: { value: J; onChange: (v: J) => void }) => {
  const ability = String(value['ability']) as (typeof ABILITY_NAMES)[number];
  const set = (key: string, v: unknown): void => onChange({ ...value, [key]: v });
  const unset = (key: string): void => {
    const { [key]: _removed, ...rest } = value;
    onChange(rest);
  };
  const pay = value['pay'] as J | null | undefined;
  return (
    <div className="ability">
      <div className="ability-head">
        <Select value={ability} kind="ability" options={ABILITY_NAMES} onChange={(a) => onChange({ ...ABILITY_TEMPLATES[a as (typeof ABILITY_NAMES)[number]] })} />
        {ability === 'on' ? (
          <>
            <Field label="出来事">
              <Select value={String(value['event'])} kind="event" options={EVENT_NAMES} onChange={(e) => set('event', e)} />
            </Field>
            <Field label="N回ごと">
              <input
                type="number"
                className="int"
                value={typeof value['every'] === 'number' ? value['every'] : ''}
                placeholder="毎回"
                onChange={(e) => (e.target.value === '' ? unset('every') : set('every', Number(e.target.value)))}
              />
            </Field>
            <Check label="ゲーム中1回" value={value['once']} onChange={(b) => (b ? set('once', true) : unset('once'))} />
          </>
        ) : null}
        {ability === 'freeAction' ? (
          <>
            <Check label="1ラウンドに1回" value={value['oncePerRound']} onChange={(b) => set('oncePerRound', b)} />
            <Field label="支払い">
              {pay ? (
                <span>
                  <Select value={String(pay['res'])} kind="res" options={['gold', 'materials']} onChange={(r) => set('pay', { ...pay, res: r })} />
                  <Int value={pay['amount']} onChange={(n) => set('pay', { ...pay, amount: n })} />
                  <button type="button" className="btn small" onClick={() => set('pay', null)}>
                    なし
                  </button>
                </span>
              ) : (
                <button type="button" className="btn small" onClick={() => set('pay', { res: 'gold', amount: 1 })}>
                  支払いを付ける
                </button>
              )}
            </Field>
            <Field label="条件">
              <ConditionEditor value={value['require']} onChange={(c) => set('require', c)} nullable />
            </Field>
          </>
        ) : null}
        {ability === 'actionSpace' ? (
          <Field label="ワーカー">
            <Int value={value['workers']} onChange={(n) => set('workers', n)} />
          </Field>
        ) : null}
      </div>
      {ability === 'on' ? <FilterEditor value={(value['filter'] as J) ?? {}} onChange={(f) => set('filter', f)} /> : null}
      {ability === 'modifier' ? (
        <ModifierEditor value={(value['modifier'] as J) ?? {}} onChange={(m) => set('modifier', m)} />
      ) : (
        <CommandList value={(value['do'] as J[]) ?? []} onChange={(c) => set('do', c)} />
      )}
    </div>
  );
};

/** 効果スクリプト全体。上にアイコンの並びと補足の文章の見本を出す。 */
export const ScriptEditor = ({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) => {
  const abilities = Array.isArray(value) ? (value as J[]) : [];
  let preview: { icons: ReturnType<typeof iconSequence>; texts: string[] } | null = null;
  try {
    const script = abilities as unknown as Ability[];
    preview = { icons: iconSequence(script), texts: describeScript(script) };
  } catch {
    preview = null;
  }
  return (
    <div className="script-editor">
      {preview ? (
        <div className="script-preview">
          {preview.icons.map((tokens, i) => (
            <div key={i} className="preview-row">
              <IconRow tokens={tokens} size="sm" />
              <span className="muted small">{preview?.texts[i]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">（見本を組み立てられない。検査で内容を確かめること）</div>
      )}
      {abilities.map((ability, i) => (
        <div key={i} className="ability-row">
          <AbilityEditor value={ability} onChange={(a) => onChange(abilities.map((x, j) => (j === i ? a : x)))} />
          <button type="button" className="btn small" onClick={() => onChange(abilities.filter((_, j) => j !== i))}>
            能力を削除
          </button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...abilities, { ...ABILITY_TEMPLATES.onPlay }])}>
        能力を追加
      </button>
    </div>
  );
};
