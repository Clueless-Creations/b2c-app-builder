-- Habit-tracker starter schema (prompt 01 baseline).
-- Habit data is private: owner-only RLS on every table, tested in
-- supabase/tests/0001_rls.test.sql per backend-data-contract.md.
-- Timezone matters: streaks are computed against the user's local midnight,
-- so the profile carries an IANA timezone captured at signup (prompt 02).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- One check-in per habit per local day; checked_on is the user-local date.
create table public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  checked_on date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, checked_on)
);

-- Streak recoveries are the ethical escape hatch for the HIGH-risk streak
-- mechanic (ethics-guardrail.md): a missed day can be repaired, and usage of
-- this table is the counter-metric.
create table public.streak_recoveries (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  recovered_on date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, recovered_on)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  remind_at_local time not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index habits_owner_idx on public.habits (owner_id, created_at);
create index checkins_habit_day_idx on public.habit_checkins (habit_id, checked_on desc);
create index checkins_owner_day_idx on public.habit_checkins (owner_id, checked_on desc);
create index reminders_owner_idx on public.reminders (owner_id);

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.habit_checkins enable row level security;
alter table public.streak_recoveries enable row level security;
alter table public.reminders enable row level security;

create policy "read own profile" on public.profiles for select using ((select auth.uid()) = id);
create policy "insert own profile" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "update own profile" on public.profiles for update using ((select auth.uid()) = id);

create policy "read own habits" on public.habits for select using ((select auth.uid()) = owner_id);
create policy "insert own habits" on public.habits for insert with check ((select auth.uid()) = owner_id);
create policy "update own habits" on public.habits for update using ((select auth.uid()) = owner_id);
create policy "delete own habits" on public.habits for delete using ((select auth.uid()) = owner_id);

create policy "read own checkins" on public.habit_checkins for select using ((select auth.uid()) = owner_id);
create policy "insert own checkins" on public.habit_checkins for insert with check ((select auth.uid()) = owner_id);
create policy "delete own checkins" on public.habit_checkins for delete using ((select auth.uid()) = owner_id);

create policy "read own recoveries" on public.streak_recoveries for select using ((select auth.uid()) = owner_id);
create policy "insert own recoveries" on public.streak_recoveries for insert with check ((select auth.uid()) = owner_id);

create policy "read own reminders" on public.reminders for select using ((select auth.uid()) = owner_id);
create policy "insert own reminders" on public.reminders for insert with check ((select auth.uid()) = owner_id);
create policy "update own reminders" on public.reminders for update using ((select auth.uid()) = owner_id);
create policy "delete own reminders" on public.reminders for delete using ((select auth.uid()) = owner_id);
