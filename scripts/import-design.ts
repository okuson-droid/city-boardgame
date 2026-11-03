// design/ の設計文書から src/data/ の JSON を作る。
// 文言は変更せずに取り込み、provisional と、rules.md・指示書に基づく解釈（clarifications）を加える。
// 実行：npm run import:design
//
// design/ は読むだけで変更しない（指示書 0-1）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const designDir = join(root, 'design');
const dataDir = join(root, 'src', 'data');

const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(designDir, name), 'utf8')) as Record<string, unknown>;

const writeJson = (name: string, value: unknown): void => {
  writeFileSync(join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`書き出した：src/data/${name}`);
};

const asRecords = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    throw new Error('配列ではない');
  }
  return value as Record<string, unknown>[];
};

// ---------------------------------------------------------------------------
// キャラクター・特別な市民カード：原本の構造のまま provisional を加える
// ---------------------------------------------------------------------------

const importPlain = (source: string, target: string, listKey: string): void => {
  const original = readJson(source);
  const items = asRecords(original[listKey]).map((item) => ({ ...item, provisional: false }));
  writeJson(target, {
    importedFrom: `design/${source}`,
    provisional: false,
    ...original,
    [listKey]: items,
  });
};

importPlain('data_characters.json', 'characters.json', 'characters');
importPlain('data_special_citizens.json', 'special_citizens.json', 'cards');

// ---------------------------------------------------------------------------
// 襲撃カード：rules.md 第19章の暫定規定を clarifications として加える
// ---------------------------------------------------------------------------

const raidClarifications = (id: number): string[] => {
  const list = ['「襲撃ラウンド数」は、その襲撃を判定するラウンドの番号（1〜5）である（rules.md v0.8 19-3-1）。'];
  if (id === 5) {
    list.push('得点は基本得点を含めた合算後の数値であり、7-5-1 の基本得点は加えない（rules.md v0.8 19-3-3）。');
  } else {
    list.push('7-5-1 の基本得点に加えて、この固有効果を適用する（rules.md v0.8 19-3-3）。');
  }
  if (id === 1 || id === 2 || id === 4) {
    list.push('「〜を失う」で保有量が足りない場合は、保有量を0にして終える（rules.md v0.8 19-3-4）。');
  }
  if (id === 3) {
    list.push('金の生産力は0未満にならない（rules.md v0.8 19-3-4）。');
  }
  if (id === 1 || id === 3) {
    list.push('撃退成功時の土地タイルは資材を支払わずに 4-2 に従って配置する（rules.md v0.8 19-1-1）。');
  }
  return list;
};

{
  const original = readJson('data_raid_cards.json');
  const cards = asRecords(original['cards']).map((card) => ({
    ...card,
    provisional: false,
    clarifications: raidClarifications(Number(card['id'])),
  }));
  writeJson('raid_cards.json', {
    importedFrom: 'design/data_raid_cards.json',
    provisional: false,
    ...original,
    cards,
  });
}

// ---------------------------------------------------------------------------
// 文明カード：文明カード一覧_sample.md の表を取り込む（指示書 2-1）
// ---------------------------------------------------------------------------

const TAG_IDS: Record<string, string> = {
  軍事: 'military',
  経済: 'economy',
  学術: 'academic',
  生活: 'life',
  環境: 'environment',
  文学: 'literature',
  美術: 'art',
  音楽: 'music',
};

type ClarificationJson = { text: string; source: string; provisional: boolean };

const decided = (text: string, source: string): ClarificationJson => ({ text, source, provisional: false });
const provisional = (text: string): ClarificationJson => ({
  text,
  source: '指示書_2026-11-03_初期実装.md 2-1（仮置き）',
  provisional: true,
});

const TERM_SOURCE = 'rules.md v0.8 19-6-4（表記の読み替え）';

const civClarifications = (id: string, text: string): ClarificationJson[] => {
  const list: ClarificationJson[] = [];
  if (id === '011') {
    list.push(decided('「生活レベル」はインフラレベルである。', 'decisions.md 1-1（ユーザー決定）'));
  }
  if (id === '012') {
    list.push(decided('「市民カード」は特別な市民カードである。公開カードから1枚を選び、山札から1枚補充する（9-3-2-2）。', TERM_SOURCE));
  }
  if (text.includes('軍事トークン')) {
    list.push(decided('「軍事トークン」は軍事力トークンである。', TERM_SOURCE));
  }
  if (text.includes('臨時ワーカーを2つ') || text.includes('通常ワーカー1つ')) {
    list.push(decided('ワーカーの「つ」は「人」と読み替える。', TERM_SOURCE));
  }
  if (text.includes('金の生産') || text.includes('資材の生産')) {
    list.push(decided('「金の生産」「資材の生産」は金・資材の生産力である。', TERM_SOURCE));
  }
  if (text.includes('軍事力が')) {
    list.push(provisional('「軍事力」は軍事レベルである。'));
  }
  if (id === '026') {
    list.push(provisional('「襲撃の撃退に必要な軍事力」は、そのラウンドの撃退ライン − 軍事レベル（0未満は0）である。'));
  }
  if (id === '003') {
    list.push(provisional('建設コストのうち金だけを免除し、資材は支払う。'));
  }
  if (['006', '007', '008', '009'].includes(id)) {
    list.push(provisional('資材は支払わない（19-1-1）。配置は 4-2-1 の隣接に従う。'));
  }
  if (id === '002') {
    list.push(decided('資材は支払わず、4-2 に従って配置する。', 'rules.md v0.8 19-1-1'));
  }
  return list;
};

{
  const markdown = readFileSync(join(designDir, '文明カード一覧_sample.md'), 'utf8');
  const rows = markdown
    .split('\n')
    .filter((line) => /^\|\s*\d{3}\s*\|/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  const cards = rows.map((cells) => {
    const [id = '', , costText = '', tagText = '', , text = ''] = cells;
    const gold = Number(costText.replace('金', ''));
    if (!Number.isInteger(gold)) {
      throw new Error(`コストを読めない：${id} ${costText}`);
    }
    const tags = tagText.split(/[、,／/]/).map((tag) => {
      const tagId = TAG_IDS[tag.trim()];
      if (tagId === undefined) {
        throw new Error(`未知のタグ：${id} ${tag}`);
      }
      return tagId;
    });
    return {
      id,
      name: `文明カード${id}`,
      cost: { gold },
      tags,
      playCondition: null,
      effectCondition: null,
      points: 1,
      text,
      clarifications: civClarifications(id, text),
      provisional: true,
      provisionalFields: ['name', 'playCondition', 'effectCondition', 'points'],
    };
  });
  writeJson('cards_civilization.json', {
    importedFrom: 'design/文明カード一覧_sample.md',
    provisional: true,
    notes: [
      '001〜042 の42枚をデッキとする。総枚数は未決である（指示書 2-1）。',
      'cost・tags・text は原本のまま。tags は原本のタグを識別子に置き換えたものである。',
      '名称・プレイ条件・効果適用条件・固有得点は仮置きである（provisionalFields）。',
      '効果の命令セット化は段階3（feat/effects）で行う。',
    ],
    cards,
  });
}
