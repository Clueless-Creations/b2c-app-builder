-- pgTAP RLS tests — run with `supabase test db` (requires the local stack).
-- backend-data-contract.md: untested authorization rules are a launch blocker.
-- Habit data is private: owner access works, cross-user and anonymous access
-- are denied.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'user1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'user2@test.local');

insert into public.profiles (id, display_name, timezone)
values
  ('00000000-0000-0000-0000-000000000001', 'User One', 'America/New_York'),
  ('00000000-0000-0000-0000-000000000002', 'User Two', 'UTC');

insert into public.habits (id, owner_id, name)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'morning run');

insert into public.habit_checkins (habit_id, owner_id, checked_on)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-06-09');

-- Authenticated as user 1: owner access works.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select results_eq(
  $$select count(*) from public.habits$$,
  array[1::bigint],
  'owner can read their own habits'
);

select lives_ok(
  $$insert into public.habit_checkins (habit_id, owner_id, checked_on)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-06-10')$$,
  'owner can check in their own habit'
);

-- Authenticated as user 2: another user''s habits are invisible and immutable.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select results_eq(
  $$select count(*) from public.habits$$,
  array[0::bigint],
  'other users cannot read someone else''s habits'
);

select results_eq(
  $$select count(*) from public.habit_checkins$$,
  array[0::bigint],
  'other users cannot read someone else''s check-ins'
);

select throws_ok(
  $$insert into public.habit_checkins (habit_id, owner_id, checked_on)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-06-11')$$,
  '42501',
  'new row violates row-level security policy for table "habit_checkins"',
  'users cannot check in as someone else'
);

-- Anonymous: nothing is visible.
set local role anon;
set local request.jwt.claims to '{}';

select results_eq(
  $$select count(*) from public.habits$$,
  array[0::bigint],
  'anonymous visitors cannot read any habits'
);

select * from finish();
rollback;
