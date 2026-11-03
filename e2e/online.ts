// オンライン版の受け入れ検査（段階5）。サーバーを起動し、3つのブラウザ（別々の利用者）で1局を打ち切る。
// - 部屋を作る・ルームコードで入る・各席は自分の手番だけ盤面の所作（data-target）で選ぶ。
// - 途中で1人がページを読み込み直して「続きから」で戻る（再接続）。
// - 途中でサーバーを再起動し、記録から続きを遊べることを確かめる。
// - 他の席の手札の DOM への漏れ・画面のはみ出し・安全網に落ちた合法手・ページのエラーが0件であること。
// 実行：npm run accept:online（先にクライアントとサーバーをビルドする）
// ONLINE_BACKEND=supabase-mock のときは、自前のサーバーの代わりに Supabase の模擬（e2e/supabase-mock.ts）を起動し、
// Supabase 版の通信（Edge Function への POST と Realtime の Broadcast）で同じ検査を行う（npm run accept:supabase）。

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const roomsDir = mkdtempSync(join(tmpdir(), 'rooms-'));

const BACKEND = process.env['ONLINE_BACKEND'] === 'supabase-mock' ? 'supabase-mock' : 'server';
const SERVER_ARGS =
  BACKEND === 'supabase-mock' ? ['--experimental-strip-types', '--no-warnings', 'e2e/supabase-mock.ts'] : ['dist-server/main.js'];

const startServer = (): Promise<ChildProcess> =>
  new Promise((resolve, reject) => {
    const child = spawn('node', SERVER_ARGS, {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), ROOMS_DIR: roomsDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('起動した')) resolve(child);
    });
    child.on('error', reject);
  });

const stopServer = (child: ChildProcess): Promise<void> =>
  new Promise((resolve) => {
    child.on('exit', () => resolve());
    child.kill();
  });

let seed = 20261103;
const random = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const weight = (t: string): number => (t === 'pass' ? 0.15 : t === 'free-panel' || t.startsWith('free:') ? 0.05 : 1);

const problems = { leaks: [] as string[], overflow: [] as string[], fallback: [] as string[], errors: [] as string[] };

const inspect = async (page: Page, label: string): Promise<void> => {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const game = document.querySelector<HTMLElement>('.game');
    const seat = game?.dataset['seat'] ?? '';
    return {
      overflow: doc.scrollWidth > innerWidth + 1 || doc.scrollHeight > innerHeight + 1,
      // オンライン版では、手札の要素はすべて自分の席のものでなければならない。
      leaks: [...document.querySelectorAll<HTMLElement>('[data-hand-card]')]
        .filter((el) => el.dataset['owner'] !== seat)
        .map((el) => el.dataset['handCard'] ?? ''),
      fallback: [...document.querySelectorAll<HTMLElement>('[data-fallback]')].map((el) => el.dataset['fallback'] ?? ''),
    };
  });
  if (r.overflow) problems.overflow.push(label);
  problems.leaks.push(...r.leaks.map((c) => `${label}：${c}`));
  problems.fallback.push(...r.fallback.map((f) => `${label}：${f}`));
};

/** 自分の手番なら所作を1つ行う。行ったら true。 */
const act = async (page: Page): Promise<boolean> => {
  if (await page.$('[data-ui="close-summary"]')) await page.click('[data-ui="close-summary"]');
  const targets = await page.evaluate(() => {
    const game = document.querySelector<HTMLElement>('.game');
    if (!game || game.dataset['seat'] !== game.dataset['turn']) return [];
    return [...document.querySelectorAll<HTMLElement | SVGElement>('[data-target]')]
      .filter((el) => el.getClientRects().length > 0 && el.getAttribute('aria-disabled') !== 'true')
      .map((el) => el.getAttribute('data-target') ?? '');
  });
  if (targets.length === 0) return false;
  const total = targets.reduce((s, t) => s + weight(t), 0);
  let r = random() * total;
  const target = targets.find((t) => (r -= weight(t)) <= 0) ?? targets[targets.length - 1] ?? '';
  const before = await page.evaluate(() => document.querySelector('.game')?.getAttribute('data-turn'));
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll<HTMLElement | SVGElement>('[data-target]')].find(
      (x) => x.getAttribute('data-target') === t && x.getClientRects().length > 0,
    );
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, target);
  // 選択を送った場合は、サーバーの知らせで局面が変わるのを待つ。
  if (!target.startsWith('pen:') && target !== 'free-panel' && !target.startsWith('cell:')) {
    await page.waitForFunction((b) => document.querySelector('.game')?.getAttribute('data-turn') !== b || true, before, { timeout: 2000 });
  }
  return true;
};

const main = async (): Promise<number> => {
  let server = await startServer();
  const browser = await chromium.launch();
  const pages: Page[] = [];
  for (let i = 0; i < 3; i += 1) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.errors.push(`P${i}：${e.message}`));
    page.on('console', (m) => {
      // 再起動中の接続の失敗は想定どおりなので数えない。
      if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|EventSource|WebSocket|Failed to load resource|Failed to fetch/.test(m.text())) {
        problems.errors.push(`P${i}：${m.text()}`);
      }
    });
    await page.goto(`${BASE}/#speed=none`);
    await page.waitForSelector('[data-ui="online-name"]');
    await page.fill('[data-ui="online-name"]', `P${i}`);
    pages.push(page);
  }
  const [host, ...guests] = pages as [Page, Page, Page];
  await host.click('[data-ui="online-players-3"]');
  await host.click('[data-ui="online-create"]');
  const code = (await (await host.waitForSelector('[data-ui="room-code"]')).innerText()).trim();
  for (const guest of guests) {
    await guest.fill('[data-ui="online-code"]', code);
    await guest.click('[data-ui="online-join"]');
  }
  for (const page of pages) await page.waitForSelector('.game');

  let steps = 0;
  let idle = 0;
  let finished = false;
  let reloaded = false;
  let restarted = false;
  while (steps < 8000) {
    if (await host.$('[data-final]')) {
      finished = true;
      break;
    }
    // 再接続：120手目に2人目がページを読み込み直し、「続きから」で戻る。
    if (!reloaded && steps >= 120) {
      reloaded = true;
      const page = pages[1] as Page;
      await page.reload();
      await page.click(`[data-ui="online-resume-${code}"]`);
      await page.waitForSelector('.game');
    }
    // サーバーの再起動：240手目に止めて起動し直す。画面は自動で繋ぎ直す。
    if (!restarted && steps >= 240) {
      restarted = true;
      await stopServer(server);
      server = await startServer();
      for (const page of pages) await page.waitForFunction(() => !document.querySelector('.online-message'), undefined, { timeout: 15000 });
    }
    let acted = false;
    for (const [i, page] of pages.entries()) {
      await inspect(page, `${steps}手目 P${i}`);
      if (await act(page)) {
        acted = true;
        steps += 1;
      }
    }
    idle = acted ? 0 : idle + 1;
    if (idle > 200) break;
    if (!acted) await host.waitForTimeout(20);
  }
  await browser.close();
  await stopServer(server);
  rmSync(roomsDir, { recursive: true, force: true });

  const count = problems.leaks.length + problems.overflow.length + problems.fallback.length + problems.errors.length;
  console.log(
    `${finished && count === 0 ? '合格' : '不合格'}：オンライン3人・${BACKEND === 'server' ? '自前のサーバー' : 'Supabase の模擬'}（${steps}手、終局 ${finished ? 'あり' : 'なし'}、再接続 ${reloaded ? 'あり' : 'なし'}、再起動 ${restarted ? 'あり' : 'なし'}）` +
      ` 手札の漏れ ${problems.leaks.length}件・はみ出し ${problems.overflow.length}件・安全網 ${problems.fallback.length}件・ページのエラー ${problems.errors.length}件`,
  );
  for (const line of [...problems.leaks, ...problems.overflow, ...problems.fallback, ...problems.errors].slice(0, 10)) console.log(`  - ${line}`);
  return finished && count === 0 ? 0 : 1;
};

process.exit(await main());
