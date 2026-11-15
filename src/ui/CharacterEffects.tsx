// キャラクターの効果の文言。いまの文言（revisedEffects）があればそれを出し、原本の文言は original のときだけ添える。
import type { Character, CharacterEffect } from '../data/types.ts';

const EffectList = ({ effects, className }: { effects: readonly CharacterEffect[]; className: string }) => (
  <ul className={className}>
    {effects.map((e, i) => (
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
);

export const CharacterEffects = ({ character: c, className, original }: { character: Character; className: string; original: boolean }) => (
  <>
    <EffectList effects={c.revisedEffects ?? c.effects} className={className} />
    {original && c.revisedEffects !== undefined ? (
      <details className="char-original">
        <summary className="muted small">原本の文言</summary>
        {c.initial_bonus.length > 0 ? <p className="muted small">初期ボーナス：{c.initial_bonus.join('・')}</p> : null}
        <EffectList effects={c.effects} className={className} />
      </details>
    ) : null}
    {original && c.changes && c.changes.length > 0 ? (
      <ul className="char-changes">
        {c.changes.map((text, i) => (
          <li key={i}>
            <b>変更</b>：{text}
          </li>
        ))}
      </ul>
    ) : null}
  </>
);
