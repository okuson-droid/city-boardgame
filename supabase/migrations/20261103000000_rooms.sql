-- オンライン版の部屋（src/online/service.ts の StoredRoom）。
-- 読み書きは Edge Function（service role）だけが行う。RLS を有効にしてポリシーを作らないため、
-- 画面の鍵（anon / publishable）からは読めない（他の席の手札・山札の順序・シードを守る、rules.md 19-6-1）。
create table if not exists public.rooms (
  code text primary key,
  record jsonb not null,
  state jsonb,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

revoke all on table public.rooms from anon, authenticated;
