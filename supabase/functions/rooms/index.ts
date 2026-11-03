// オンライン版の部屋の Edge Function（Deno）。中身は src/online/edge.ts で、npm run supabase:build で bundle.js にまとめる。
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が関数に自動で与える。service role の鍵はここにだけ置き、画面には渡さない。
// 画面からは匿名で呼ぶため、JWT の検査を外して配置する（supabase/config.toml の verify_jwt = false）。

import { createHandler } from './bundle.js';

Deno.serve(
  createHandler({
    url: Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  }),
);
