// チュートリアルの受け入れ検査（ユーザー決定 2026-11-04）。はじめの画面から始め、案内の「次へ」と、光っている所作だけを押して
// 案内の最後（あとは自由に）まで進む。PC とスマホ横の2つの大きさで行う。
// - 光っていない所作を押すと受け付けず、警告が出ることも確かめる。
// - 他の席の手札の DOM への漏れ・画面のはみ出し・ページのエラーが0件であること。
// 実行：npm run accept:tutorial（先にビルドする）

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = `${pathToFileURL(join(root, 'dist', 'index.html')).href}#speed=none`;

type Result = { label: string; reached: boolean; steps: string[]; problems: string[] };

/** 光っている（コーチの強調が当たっている）所作の data-target。 */
const highlighted = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement | SVGElement>('[data-target]')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).animationName === 'coach-pulse')
      .map((el) => el.getAttribute('data-target') ?? ''),
  );

const clickTarget = (page: Page, target: string): Promise<void> =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll<HTMLElement | SVGElement>('[data-target]')].find(
      (x) => x.getAttribute('data-target') === t && x.getClientRects().length > 0,
    );
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, target);

const run = async (label: string, viewport: { width: number; height: number }): Promise<Result> => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`ページのエラー：${e.message}`));
  await page.goto(url);
  await page.click('[data-ui="tutorial"]');
  await page.waitForSelector('[data-ui="coach"]');
  const steps: string[] = [];
  let reached = false;
  let warned = false;
  for (let i = 0; i < 600; i += 1) {
    const state = await page.evaluate(() => {
      const doc = document.documentElement;
      const game = document.querySelector<HTMLElement>('.game');
      const seat = game?.dataset['seat'] ?? '';
      return {
        title: document.querySelector('.coach-title')?.textContent ?? '',
        next: document.querySelector('[data-ui="coach-next"]') !== null,
        overflow: doc.scrollWidth > innerWidth + 1 || doc.scrollHeight > innerHeight + 1,
        leaks: [...document.querySelectorAll<HTMLElement>('[data-hand-card]')].filter((el) => el.dataset['owner'] !== seat).length,
        mine: game !== null && game.dataset['seat'] === game.dataset['turn'],
      };
    });
    if (steps[steps.length - 1] !== state.title) steps.push(state.title);
    if (state.overflow) problems.push(`はみ出し：${state.title}`);
    if (state.leaks > 0) problems.push(`他の席の手札の漏れ：${state.title}`);
    if (state.title === 'あとは自由に') {
      reached = true;
      break;
    }
    if (await page.$('[data-ui="close-summary"]')) await page.click('[data-ui="close-summary"]');
    if (state.next) {
      await page.click('[data-ui="coach-next"]');
      continue;
    }
    if (!state.mine) {
      await page.waitForTimeout(30);
      continue;
    }
    const targets = await highlighted(page);
    // 一度だけ、光っていない所作を押して受け付けないことを確かめる。
    if (!warned && state.title === '土地を開拓する') {
      warned = true;
      // 選べるが光っていないアクションを押す。キャラクターによって選べるアクションが違う（英雄は最初、建物を建てる空き地がない）ため、候補を順に試す。
      let warning = '';
      for (const target of ['act:build:normal', 'act:import:normal', 'act:research:normal', 'act:drill:normal']) {
        await clickTarget(page, target);
        warning = await page.$eval('.coach-warning', (el) => el.textContent ?? '').catch(() => '');
        if (warning.includes('光っている')) break;
      }
      if (!warning.includes('光っている')) problems.push('光っていない所作を押しても警告が出ない');
    }
    if (targets.length === 0) {
      problems.push(`光っている所作がない：${state.title}`);
      break;
    }
    // 選択肢そのもの（マスを押した後に出る種類の選び分けなど）を先に押す。次にマス、建物の種類（pen:）、最後に「確定」。
    const rank = (t: string): number => (t.startsWith('cell:') ? 1 : t.startsWith('pen:') ? 2 : t === 'done' ? 3 : 0);
    const target = [...targets].sort((a, b) => rank(a) - rank(b))[0] ?? '';
    await clickTarget(page, target);
    await page.waitForTimeout(10);
  }
  await page.screenshot({ path: join(root, 'test-results', `tutorial-${label}.png`) });
  await browser.close();
  return { label, reached, steps, problems };
};

const main = async (): Promise<number> => {
  const results = [await run('pc', { width: 1440, height: 900 }), await run('phone', { width: 844, height: 390 })];
  let failed = false;
  for (const r of results) {
    const ok = r.reached && r.problems.length === 0;
    failed ||= !ok;
    console.log(`${ok ? '合格' : '不合格'}：チュートリアル ${r.label}（案内 ${r.steps.length}場面、最後まで ${r.reached ? 'あり' : 'なし'}） 問題 ${r.problems.length}件`);
    for (const line of [...new Set(r.problems)].slice(0, 10)) console.log(`  - ${line}`);
    if (!r.reached) console.log(`  通った場面：${r.steps.join(' → ')}`);
  }
  return failed ? 1 : 0;
};

process.exit(await main());
