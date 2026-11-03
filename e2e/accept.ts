// 受け入れ検査（指示書 3-4）。Playwright の自動対戦が、盤面の所作（data-target を持つ要素のクリック）だけで
// 1局を最後まで打ち切ることを確かめる。取り消しは選ばない。次の件数がすべて0であることを求める。
// - 安全網（プロンプト帯の「その他」）に落ちた合法手
// - 画面のはみ出し（ページ全体のスクロール）
// - 画面の持ち主以外の手札の DOM への漏れ
// - ページのエラー
// 実行：npm run accept（先に npm run build を行う）

import { chromium, type Page } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Run = {
  name: string;
  players: number;
  seed: number;
  width: number;
  height: number;
  maxSteps: number;
  /** 演出の速度。none 以外では、ラウンドの区切りの画面を閉じながら進める。 */
  speed: 'none' | 'fast';
};

const RUNS: Run[] = [
  { name: 'PC 1440×900・3人', players: 3, seed: 101, width: 1440, height: 900, maxSteps: 6000, speed: 'none' },
  { name: 'PC 1280×720・4人', players: 4, seed: 202, width: 1280, height: 720, maxSteps: 8000, speed: 'none' },
  { name: 'スマホ横 844×390・3人', players: 3, seed: 303, width: 844, height: 390, maxSteps: 6000, speed: 'none' },
  { name: 'PC 1440×900・3人・演出あり', players: 3, seed: 404, width: 1440, height: 900, maxSteps: 6000, speed: 'fast' },
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = join(root, 'dist', 'index.html');

type Result = {
  name: string;
  steps: number;
  finished: boolean;
  fallback: string[];
  overflow: string[];
  leaks: string[];
  errors: string[];
  stuck: string | null;
};

/** 擬似乱数（mulberry32）。 */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 画面の検査。はみ出し・手札の漏れ・安全網を数える。 */
const inspect = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const overflow =
      doc.scrollWidth > window.innerWidth + 1 || doc.scrollHeight > window.innerHeight + 1
        ? `${doc.scrollWidth}×${doc.scrollHeight}`
        : null;
    const game = document.querySelector<HTMLElement>('.game');
    const owner = game?.dataset['owner'] ?? '';
    const view = game?.dataset['view'] ?? '';
    const leaks = [...document.querySelectorAll<HTMLElement>('[data-hand-card]')]
      .filter((el) => el.dataset['owner'] !== owner || view !== owner)
      .map((el) => `${el.dataset['handCard']}（持ち主${el.dataset['owner']}、表示${view}、選択待ち${owner}）`);
    const fallback = [...document.querySelectorAll<HTMLElement>('[data-fallback]')].map((el) => el.dataset['fallback'] ?? '');
    const scene = document.querySelector<HTMLElement>('.prompt')?.dataset['scene'] ?? '';
    return { overflow, leaks, fallback, scene, final: document.querySelector('[data-final]') !== null };
  });

/** 見えている所作の候補（data-target）。取り消しは含めない。 */
const candidates = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement | SVGElement>('[data-target]')]
      .filter((el) => el.getClientRects().length > 0 && el.getAttribute('aria-disabled') !== 'true')
      .map((el) => el.getAttribute('data-target') ?? ''),
  );

const clickTarget = (page: Page, target: string) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll<HTMLElement | SVGElement>('[data-target]')].find(
      (x) => x.getAttribute('data-target') === t && x.getClientRects().length > 0,
    );
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, target);

const weight = (target: string): number => {
  if (target === 'pass') return 0.15;
  if (target === 'free-panel' || target.startsWith('free:')) return 0.05;
  if (target.startsWith('pen:')) return 0.6;
  return 1;
};

const pick = (items: readonly string[], random: () => number): string | undefined => {
  const total = items.reduce((sum, t) => sum + weight(t), 0);
  let r = random() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
};

/** 他プレイヤーのタブを開き、手札が出ないことを確かめてから戻る。 */
const checkOtherTabs = async (page: Page, leaks: string[]): Promise<void> => {
  const info = await page.evaluate(() => {
    const game = document.querySelector<HTMLElement>('.game');
    return {
      owner: game?.dataset['owner'] ?? '',
      tabs: [...document.querySelectorAll<HTMLElement>('[data-ui^="tab-"]')].map((t) => t.dataset['ui'] ?? ''),
    };
  });
  for (const tab of info.tabs) {
    if (tab === `tab-${info.owner}`) continue;
    await page.click(`[data-ui="${tab}"]`);
    const shown = await page.evaluate(() => document.querySelectorAll('[data-hand-card]').length);
    if (shown > 0) leaks.push(`${tab} を表示中に手札が ${shown} 枚出た`);
  }
  if (info.owner !== '') await page.click(`[data-ui="tab-${info.owner}"]`);
};

const play = async (run: Run): Promise<Result> => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: run.width, height: run.height } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`file://${html}#speed=${run.speed}&seed=${run.seed}`);
  await page.click(`[data-ui="players-${run.players}"]`);
  await page.click('[data-target="start"]');

  const random = rng(run.seed);
  const result: Result = { name: run.name, steps: 0, finished: false, fallback: [], overflow: [], leaks: [], errors, stuck: null };
  let idle = 0;
  for (let step = 0; step < run.maxSteps; step += 1) {
    const view = await inspect(page);
    if (view.overflow) result.overflow.push(`${step}手目（${view.scene}）：${view.overflow}`);
    result.leaks.push(...view.leaks.map((l) => `${step}手目：${l}`));
    result.fallback.push(...view.fallback.map((f) => `${step}手目（${view.scene}）：${f}`));
    if (view.final) {
      result.finished = true;
      result.steps = step;
      break;
    }
    // ラウンドの区切りの画面（演出あり）は閉じて進める。
    if (await page.$('[data-ui="close-summary"]')) await page.click('[data-ui="close-summary"]');
    if (step % 40 === 0) await checkOtherTabs(page, result.leaks);
    const items = await candidates(page);
    const target = pick(items, random);
    if (target === undefined) {
      // 縮退配置では、対象のない側を表示していることがある。切り替えて探す。
      idle += 1;
      if (idle > 3) {
        result.stuck = `${step}手目（${view.scene}）で所作の候補がない`;
        break;
      }
      await page.click('[data-ui="pane"]').catch(() => undefined);
      continue;
    }
    idle = 0;
    await clickTarget(page, target);
    result.steps = step + 1;
  }
  if (!result.finished && result.stuck === null) result.stuck = `${run.maxSteps}手で終局しなかった`;
  await browser.close();
  return result;
};

if (!existsSync(html)) {
  console.error('dist/index.html がない。先に npm run build を実行すること。');
  process.exit(1);
}

let failed = false;
for (const run of RUNS) {
  const r = await play(run);
  const problems = r.fallback.length + r.overflow.length + r.leaks.length + r.errors.length + (r.finished ? 0 : 1);
  console.log(
    `${r.finished && problems === 0 ? '合格' : '不合格'}：${r.name}（${r.steps}手、終局 ${r.finished ? 'あり' : 'なし'}）` +
      ` 安全網 ${r.fallback.length}件・はみ出し ${r.overflow.length}件・手札の漏れ ${r.leaks.length}件・ページのエラー ${r.errors.length}件`,
  );
  for (const line of [...r.fallback, ...r.overflow, ...r.leaks, ...r.errors].slice(0, 10)) console.log(`  - ${line}`);
  if (r.stuck) console.log(`  - ${r.stuck}`);
  if (problems > 0) failed = true;
}
process.exit(failed ? 1 : 0);
