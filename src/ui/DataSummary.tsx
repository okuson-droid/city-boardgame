// 段階1（データ層）の確認用ページ。収録したデータの件数と仮置きの印を表示する。
// 段階4（ローカル UI）で置き換える。

import { GAME_DATA, type ProvisionalMark } from '../data/index.ts';

type Row = { readonly label: string; readonly items: readonly ProvisionalMark[] };

const ROWS: readonly Row[] = [
  { label: '個人ボード', items: GAME_DATA.boards },
  { label: '文明カード', items: GAME_DATA.civilizationCards },
  { label: '計画都市カード', items: GAME_DATA.plannedCityCards },
  { label: '自然公園カード', items: GAME_DATA.natureParkCards },
  { label: '特別な市民カード', items: GAME_DATA.specialCitizens },
  { label: 'キャラクター', items: GAME_DATA.characters },
  { label: '襲撃カード', items: GAME_DATA.raidCards },
  { label: 'ボーナスタイル', items: GAME_DATA.bonusTiles },
];

const provisionalCount = (items: readonly ProvisionalMark[]): number => items.filter((i) => i.provisional).length;

export const DataSummary = () => (
  <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
    <h1>都市開発ボードゲーム（仮）— データ層</h1>
    <p>rules.md v{GAME_DATA.params.rulesVersion} に準拠。ゲーム画面は段階4で実装する。</p>
    <table>
      <thead>
        <tr>
          <th>種別</th>
          <th>件数</th>
          <th>仮置き</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.label}>
            <td>{row.label}</td>
            <td>{row.items.length}</td>
            <td>{provisionalCount(row.items) > 0 ? `仮置き ${provisionalCount(row.items)}件` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </main>
);
