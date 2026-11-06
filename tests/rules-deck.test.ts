// ルール解説の取り込み結果の検査（ユーザー決定 2026-11-06。rules.md の条項に対応するゲームの処理はない）。
import { describe, expect, it } from 'vitest';
import { RULE_ICON_KEYS, RULE_SECTIONS, RULE_SLIDES, RULE_STATIC_SVGS } from '../src/rules/rule-deck.ts';
import { ACTION_ART, ICON_ART } from '../src/ui/icon-art.ts';

describe('ルール解説のスライド', () => {
  it('スライドの識別子は重ならず、各スライドはその識別子の section を1つだけ持つ', () => {
    const ids = RULE_SLIDES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of RULE_SLIDES) {
      expect(s.html.match(/<section\b/g)?.length).toBe(1);
      expect(s.html).toContain(`<section id="${s.id}"`);
      expect(s.html).not.toMatch(/<script|\son\w+=|<aside>/i);
    }
  });

  it('章の始まりはどれもスライドの識別子である', () => {
    for (const s of RULE_SECTIONS) expect(RULE_SLIDES.some((slide) => slide.id === s.start)).toBe(true);
  });

  it('スライドの画像はすべて、ゲームの図案か取り込んだ SVG で描ける', () => {
    for (const s of RULE_SLIDES) {
      for (const m of s.html.matchAll(/\/_blob\/([0-9a-f]+)/g)) {
        const blob = m[1] ?? '';
        const key = RULE_ICON_KEYS[blob];
        const art = key === undefined ? RULE_STATIC_SVGS[blob] : key.startsWith('act.') ? ACTION_ART[key.slice(4)] : ICON_ART[key];
        expect(art, `${s.id} の ${blob}`).toBeTruthy();
      }
    }
  });
});
