-- AI chat companion starter schema (prompt 01 baseline).
-- Conversations and messages are strictly private: owner-only RLS on every
-- table, tested in supabase/tests/0001_rls.test.sql per backend-data-contract.md.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  persona_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Long-term memory snippets (prompt 05). One row per remembered fact, scoped
-- to the owner; the model only ever sees memories for the requesting user.
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  source_conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Usage metering (prompt 06). Append-only event log the quota check sums over.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('message', 'tokens')),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index conversations_owner_idx on public.conversations (owner_id, updated_at desc);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index memories_owner_idx on public.memories (owner_id, created_at desc);
create index usage_events_owner_idx on public.usage_events (owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.usage_events enable row level security;

-- Owner-only access everywhere; there is no public surface in a chat product.
create policy "read own profile" on public.profiles for select using ((select auth.uid()) = id);
create policy "insert own profile" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "update own profile" on public.profiles for update using ((select auth.uid()) = id);

create policy "read own conversations" on public.conversations for select using ((select auth.uid()) = owner_id);
create policy "insert own conversations" on public.conversations for insert with check ((select auth.uid()) = owner_id);
create policy "update own conversations" on public.conversations for update using ((select auth.uid()) = owner_id);
create policy "delete own conversations" on public.conversations for delete using ((select auth.uid()) = owner_id);

create policy "read own messages" on public.messages for select using ((select auth.uid()) = owner_id);
create policy "insert own messages" on public.messages for insert with check ((select auth.uid()) = owner_id);
create policy "delete own messages" on public.messages for delete using ((select auth.uid()) = owner_id);

create policy "read own memories" on public.memories for select using ((select auth.uid()) = owner_id);
create policy "insert own memories" on public.memories for insert with check ((select auth.uid()) = owner_id);
create policy "delete own memories" on public.memories for delete using ((select auth.uid()) = owner_id);

create policy "read own usage" on public.usage_events for select using ((select auth.uid()) = owner_id);
create policy "insert own usage" on public.usage_events for insert with check ((select auth.uid()) = owner_id);
