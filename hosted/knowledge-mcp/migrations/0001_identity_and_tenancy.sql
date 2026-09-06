-- Migration 0001: identity and tenancy.
--
-- Access-policy invariants this schema preserves, from core/hosted/auth.ts:
--   opaqueId  /^[a-zA-Z0-9_-]{1,80}$/   auth.ts:6   -> length + GLOB negated-class CHECK
--   ISO UTC   z.iso.datetime()          auth.ts:15  -> strftime round-trip CHECK
--   caps      max 64 allowed subjects   auth.ts:20  -> per-account membership trigger
--   owner     ownerSubject is allowed   auth.ts:44  -> single active owner membership per account
--
-- `users.id` is the value that reaches `Principal.subject`. There is deliberately no
-- separate identities table: `google_sub` is UNIQUE directly on `users`, so a Google
-- identity resolves to exactly one user in one indexed read on the login hot path.

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_-]*'),
  -- Google's `sub` claim. Stable per Google account, never reissued, never an email.
  google_sub TEXT NOT NULL UNIQUE
    CHECK (length(google_sub) BETWEEN 1 AND 255 AND google_sub NOT GLOB '*[^a-zA-Z0-9_.-]*'),
  email TEXT NOT NULL
    CHECK (length(email) BETWEEN 3 AND 320 AND email LIKE '%_@_%.%' AND email NOT GLOB '*[ ,;<>]*'),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  display_name TEXT
    CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  updated_at TEXT NOT NULL CHECK (updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)),
  -- Set instead of deleting. A disabled user keeps its audit trail and its google_sub.
  disabled_at TEXT
    CHECK (disabled_at IS NULL OR disabled_at = strftime('%Y-%m-%dT%H:%M:%fZ', disabled_at))
) STRICT;

CREATE UNIQUE INDEX users_by_email ON users (lower(email));

-- An account is the tenant and the billing entity. `stripe_customer_id` is NOT NULL:
-- the Stripe Customer is created eagerly at first Google login, so gifting always finds
-- an existing Customer and never matches by email. The cost of this choice is that a
-- Stripe outage blocks first-time signup; it does not block existing users.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_-]*'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  stripe_customer_id TEXT NOT NULL UNIQUE
    CHECK (stripe_customer_id GLOB 'cus_*' AND length(stripe_customer_id) BETWEEN 5 AND 80
           AND stripe_customer_id NOT GLOB '*[^a-zA-Z0-9_]*'),
  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  updated_at TEXT NOT NULL CHECK (updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)),
  suspended_at TEXT
    CHECK (suspended_at IS NULL OR suspended_at = strftime('%Y-%m-%dT%H:%M:%fZ', suspended_at))
) STRICT;

-- Replaces `policy.allowedSubjects`. auth.ts:78 requires the credential's subject to be
-- allowed; here the api_keys composite foreign key requires it to be a member of the
-- key's own account, which is the multi-tenant form of the same rule.
CREATE TABLE memberships (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'revoked')),
  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  updated_at TEXT NOT NULL CHECK (updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)),
  PRIMARY KEY (account_id, user_id)
) STRICT;

CREATE INDEX memberships_by_user ON memberships (user_id, status);

-- policy.ownerSubject was a single value inside a single policy. Per account, exactly
-- one active owner may exist.
CREATE UNIQUE INDEX memberships_single_active_owner
  ON memberships (account_id) WHERE role = 'owner' AND status = 'active';

-- policy.allowedSubjects had `.max(64)` (auth.ts:20). SQLite cannot express a
-- cross-row CHECK, so the cap is a trigger rather than repository convention.
CREATE TRIGGER memberships_cap_per_account
BEFORE INSERT ON memberships
WHEN (SELECT count(*) FROM memberships WHERE account_id = NEW.account_id) >= 64
BEGIN
  SELECT RAISE(ABORT, 'membership_cap_exceeded');
END;

-- A membership must not be moved between tenants. Isolation guard rail, not hygiene.
CREATE TRIGGER memberships_tenancy_is_immutable
BEFORE UPDATE ON memberships
WHEN NEW.account_id <> OLD.account_id OR NEW.user_id <> OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'membership_tenancy_is_immutable');
END;
