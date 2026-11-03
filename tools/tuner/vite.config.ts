// チューナーの開発サーバー（指示書 3-5）。npm run tuner で起動する。配布用ビルド（vite.config.ts）には含めない。
// - /tools/tuner/index.html：チューナー
// - /tools/tuner/play.html：調整案を適用したローカル版（試遊）
// - POST /__tuner/export：調整案の書き戻しを受け、src/data/ の JSON を書き換える

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(root, 'src', 'data');

/** 書き戻してよいファイル。src/data/ に既にあるゲームデータの JSON だけを受け付ける。 */
const writableFiles = (): Set<string> =>
  new Set(readdirSync(dataDir).filter((name) => name.endsWith('.json') && name !== 'icon_keys.json'));

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const reply = (res: ServerResponse, status: number, value: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
};

const exportPlugin = (): Plugin => ({
  name: 'tuner-export',
  configureServer(server) {
    server.middlewares.use('/__tuner/export', (req, res) => {
      if (req.method !== 'POST') {
        reply(res, 405, { error: 'POST だけを受け付ける' });
        return;
      }
      void readBody(req)
        .then((text) => {
          const body = JSON.parse(text) as { files?: Record<string, unknown> };
          const files = body.files ?? {};
          const allowed = writableFiles();
          const rejected = Object.keys(files).filter((name) => !allowed.has(name) || !existsSync(join(dataDir, name)));
          if (rejected.length > 0) {
            reply(res, 400, { error: `書き戻せないファイルである：${rejected.join('、')}` });
            return;
          }
          for (const [name, value] of Object.entries(files)) {
            writeFileSync(join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
          }
          reply(res, 200, { written: Object.keys(files) });
        })
        .catch((error: unknown) => reply(res, 400, { error: String(error) }));
    });
  },
});

export default defineConfig({
  root,
  plugins: [exportPlugin()],
  // 試遊ページだけが調整案のデータを読む（src/data/index.ts の TUNER_PLAYTEST）。
  define: { 'import.meta.env.VITE_TUNER': JSON.stringify('1') },
  esbuild: { jsx: 'automatic' },
  server: { open: '/tools/tuner/index.html' },
});
