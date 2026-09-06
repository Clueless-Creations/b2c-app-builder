-- pgTAP RLS tests — run with `supabase test db` (requires the local stack).
-- backend-data-contract.md: untested authorization rules are a launch blocker.
-- Covers owner access, cross-user denial, and anonymous read scope.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Seed two users directly (local test database only).
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'user1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'user2@test.local');

insert into public.profiles (id, username)
values
  ('00000000-0000-0000-0000-000000000001', 'user_one'),
  ('00000000-0000-0000-0000-000000000002', 'user_two');

insert into public.posts (id, author_id, body)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hello from user one');

-- Authenticated as user 1: can write own data.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$insert into public.posts (author_id, body) values ('00000000-0000-0000-0000-000000000001', 'second post')$$,
  'owner can insert their own post'
);

select throws_ok(
  $$insert into public.posts (author_id, body) values ('00000000-0000-0000-0000-000000000002', 'forged post')$$,
  '42501',
  'new row violates row-level security policy for table "posts"',
  'user cannot insert a post as someone else'
);

-- Authenticated as user 2: cannot mutate user 1 data.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select results_ne(
  $$update public.posts set body = 'hacked' where author_id = '00000000-0000-0000-0000-000000000001' returning 1$$,
  $$values (1)$$,
  'cross-user post update is denied by RLS'
);

select results_eq(
  $$select count(*) from public.notifications$$,
  array[0::bigint],
  'users cannot read other users notifications'
);

-- Anonymous: public read of posts, no notification access.
set local role anon;
set local request.jwt.claims to '{}';

select results_eq(
  $$select count(*) > 0 from public.posts$$,
  array[true],
  'anonymous visitors can read public posts'
);

select results_eq(
  $$select count(*) from public.notifications$$,
  array[0::bigint],
  'anonymous visitors cannot read notifications'
);

select * from finish();
rollback;
