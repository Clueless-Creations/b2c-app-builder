-- Photo / AI-media starter schema (prompt 01 baseline).
-- Media is private by default: owner-only RLS on every table, tested in
-- supabase/tests/0001_rls.test.sql per backend-data-contract.md.
-- Media bytes live in Supabase Storage under owner-scoped paths
-- (<owner_id>/...), never on the app server; serve via signed URLs.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('upload', 'generated')),
  storage_path text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  source_asset_id uuid references public.media_assets (id) on delete set null,
  output_asset_id uuid references public.media_assets (id) on delete set null,
  prompt text,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'moderated')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Usage metering (prompt 06). Generations have real per-unit COGS, so the
-- quota check sums this before any inference call.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('generation', 'credits')),
  amount integer not null check (amount <> 0),
  created_at timestamptz not null default now()
);

create index media_assets_owner_idx on public.media_assets (owner_id, created_at desc);
create index generations_owner_idx on public.generations (owner_id, created_at desc);
create index generations_status_idx on public.generations (status) where status in ('queued', 'running');
create index usage_events_owner_idx on public.usage_events (owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.media_assets enable row level security;
alter table public.generations enable row level security;
alter table public.usage_events enable row level security;

create policy "read own profile" on public.profiles for select using ((select auth.uid()) = id);
create policy "insert own profile" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "update own profile" on public.profiles for update using ((select auth.uid()) = id);

create policy "read own media" on public.media_assets for select using ((select auth.uid()) = owner_id);
create policy "insert own media" on public.media_assets for insert with check ((select auth.uid()) = owner_id);
create policy "delete own media" on public.media_assets for delete using ((select auth.uid()) = owner_id);

create policy "read own generations" on public.generations for select using ((select auth.uid()) = owner_id);
create policy "insert own generations" on public.generations for insert with check ((select auth.uid()) = owner_id);

create policy "read own usage" on public.usage_events for select using ((select auth.uid()) = owner_id);
create policy "insert own usage" on public.usage_events for insert with check ((select auth.uid()) = owner_id);

-- Owner-scoped private storage bucket; paths are <owner_id>/<file>.
insert into storage.buckets (id, name, public) values ('media', 'media', false);

create policy "read own media objects" on storage.objects for select using (bucket_id = 'media' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "upload own media objects" on storage.objects for insert with check (bucket_id = 'media' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "delete own media objects" on storage.objects for delete using (bucket_id = 'media' and (select auth.uid())::text = (storage.foldername(name))[1]);
