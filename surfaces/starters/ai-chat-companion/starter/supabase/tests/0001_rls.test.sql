-- pgTAP RLS tests — run with `supabase test db` (requires the local stack).
-- backend-data-contract.md: untested authorization rules are a launch blocker.
-- Chat data is strictly private: owner access works, cross-user and anonymous
-- access are denied.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'user1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'user2@test.local');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000001', 'User One'),
  ('00000000-0000-0000-0000-000000000002', 'User Two');

insert into public.conversations (id, owner_id, title)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'private thoughts');

insert into public.messages (conversation_id, owner_id, role, content)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'user', 'hello');

-- Authenticated as user 1: owner access works.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select results_eq(
  $$select count(*) from public.conversations$$,
  array[1::bigint],
  'owner can read their own conversation'
);

select lives_ok(
  $$insert into public.messages (conversation_id, owner_id, role, content)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'assistant', 'hi')$$,
  'owner can append messages to their conversation'
);

-- Authenticated as user 2: another user''s chat is invisible and immutable.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select results_eq(
  $$select count(*) from public.conversations$$,
  array[0::bigint],
  'other users cannot read someone else''s conversations'
);

select results_eq(
  $$select count(*) from public.messages$$,
  array[0::bigint],
  'other users cannot read someone else''s messages'
);

select throws_ok(
  $$insert into public.messages (conversation_id, owner_id, role, content)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'user', 'forged')$$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'users cannot write messages as someone else'
);

-- Anonymous: nothing is visible.
set local role anon;
set local request.jwt.claims to '{}';

select results_eq(
  $$select count(*) from public.conversations$$,
  array[0::bigint],
  'anonymous visitors cannot read any conversations'
);

select * from finish();
rollback;
