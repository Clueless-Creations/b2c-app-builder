-- pgTAP RLS tests — run with `supabase test db` (requires the local stack).
-- backend-data-contract.md: untested authorization rules are a launch blocker.
-- Media is private by default: owner access works, cross-user and anonymous
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

insert into public.media_assets (id, owner_id, kind, storage_path)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'upload', '00000000-0000-0000-0000-000000000001/selfie.jpg');

-- Authenticated as user 1: owner access works.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select results_eq(
  $$select count(*) from public.media_assets$$,
  array[1::bigint],
  'owner can read their own media'
);

select lives_ok(
  $$insert into public.generations (owner_id, source_asset_id, prompt)
    values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'professional headshot')$$,
  'owner can request a generation for their own asset'
);

-- Authenticated as user 2: another user''s media is invisible and immutable.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select results_eq(
  $$select count(*) from public.media_assets$$,
  array[0::bigint],
  'other users cannot read someone else''s media'
);

select results_eq(
  $$select count(*) from public.generations$$,
  array[0::bigint],
  'other users cannot read someone else''s generations'
);

select throws_ok(
  $$insert into public.generations (owner_id, prompt)
    values ('00000000-0000-0000-0000-000000000001', 'forged request')$$,
  '42501',
  'new row violates row-level security policy for table "generations"',
  'users cannot create generations as someone else'
);

-- Anonymous: nothing is visible.
set local role anon;
set local request.jwt.claims to '{}';

select results_eq(
  $$select count(*) from public.media_assets$$,
  array[0::bigint],
  'anonymous visitors cannot read any media'
);

select * from finish();
rollback;
