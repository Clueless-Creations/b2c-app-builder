-- Social-network starter schema (prompt 01 baseline: text-first / X model).
-- Variants add columns/tables (media, stories, video) without reshaping this core.
-- Every user-data table enables Row Level Security; policies are tested in
-- supabase/tests/0001_rls.test.sql per backend-data-contract.md.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 30),
  display_name text,
  bio text check (char_length(bio) <= 280),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  reply_to_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('follow', 'like', 'reply')),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Hot paths: home feed (follows join posts), profile timeline, unread badge.
create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);
create index follows_follower_idx on public.follows (follower_id);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.post_likes enable row level security;
alter table public.notifications enable row level security;

-- Public-read social product: profiles and posts are readable by everyone;
-- writes are owner-only. Private accounts/blocks land in the threat model
-- (security-release-hardening.md) before public launch.
create policy "profiles are readable" on public.profiles for select using (true);
create policy "insert own profile" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "update own profile" on public.profiles for update using ((select auth.uid()) = id);

create policy "posts are readable" on public.posts for select using (true);
create policy "insert own posts" on public.posts for insert with check ((select auth.uid()) = author_id);
create policy "update own posts" on public.posts for update using ((select auth.uid()) = author_id);
create policy "delete own posts" on public.posts for delete using ((select auth.uid()) = author_id);

create policy "follows are readable" on public.follows for select using (true);
create policy "follow as self" on public.follows for insert with check ((select auth.uid()) = follower_id);
create policy "unfollow as self" on public.follows for delete using ((select auth.uid()) = follower_id);

create policy "likes are readable" on public.post_likes for select using (true);
create policy "like as self" on public.post_likes for insert with check ((select auth.uid()) = profile_id);
create policy "unlike as self" on public.post_likes for delete using ((select auth.uid()) = profile_id);

create policy "read own notifications" on public.notifications for select using ((select auth.uid()) = recipient_id);
create policy "mark own notifications" on public.notifications for update using ((select auth.uid()) = recipient_id);
