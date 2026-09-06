-- Migration 0004: browser sessions and the audit log.

-- `id` is the lowercase hex SHA-256 of the __Host- cookie token, never the token.
-- This is the same rule api_keys follows: a database dump must not yield a usable
-- credential. The digest CHECK is identical to auth.ts:7.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 64 AND id NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  -- Not optional, unlike an API key. A browser session always expires.
  expires_at TEXT NOT NULL CHECK (expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', expires_at)),
  revoked_at TEXT
    CHECK (revoked_at IS NULL OR revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', revoked_at)),
  last_seen_at TEXT
    CHECK (last_seen_at IS NULL OR last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', last_seen_at)),
  -- Same structural rule as api_keys: the session's user must be a member of the
  -- session's account, so a stolen cookie cannot be pointed at another tenant.
  -- CASCADE so that removing a member ends their browser sessions in one statement.
  FOREIGN KEY (account_id, user_id) REFERENCES memberships (account_id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX sessions_by_user ON sessions (user_id, expires_at);
CREATE INDEX sessions_by_expiry ON sessions (expires_at);

CREATE TRIGGER sessions_identity_is_immutable
BEFORE UPDATE ON sessions
WHEN NEW.id <> OLD.id OR NEW.account_id <> OLD.account_id OR NEW.user_id <> OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'session_identity_is_immutable');
END;

CREATE TRIGGER sessions_revocation_is_terminal
BEFORE UPDATE OF revoked_at ON sessions
WHEN OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS NULL OR NEW.revoked_at <> OLD.revoked_at)
BEGIN
  SELECT RAISE(ABORT, 'session_revocation_is_terminal');
END;

-- audit_events deliberately carries NO foreign keys. An audit row records identifiers
-- that were true when the event happened; it is not a view of current state. Foreign
-- keys would let another table's lifecycle rewrite or remove history: an ON DELETE
-- CASCADE would erase the record of a deleted tenant, and an ON DELETE SET NULL would
-- fire an UPDATE that the append-only trigger below must then refuse, which would in
-- turn make deleting an account impossible. No foreign key avoids both outcomes.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_-]*'),
  -- Nullable: a failed sign-in has no tenant yet, and that is exactly the event worth
  -- keeping. Tenant-scoped reads filter on account_id and therefore never return these.
  account_id TEXT
    CHECK (account_id IS NULL OR (length(account_id) BETWEEN 1 AND 80
           AND account_id NOT GLOB '*[^a-zA-Z0-9_-]*')),
  actor_user_id TEXT
    CHECK (actor_user_id IS NULL OR (length(actor_user_id) BETWEEN 1 AND 80
           AND actor_user_id NOT GLOB '*[^a-zA-Z0-9_-]*')),
  action TEXT NOT NULL
    CHECK (length(action) BETWEEN 1 AND 80 AND action NOT GLOB '*[^a-z0-9_.]*'),
  target_type TEXT
    CHECK (target_type IS NULL OR target_type NOT GLOB '*[^a-z0-9_]*'),
  target_id TEXT
    CHECK (target_id IS NULL OR (length(target_id) BETWEEN 1 AND 80
           AND target_id NOT GLOB '*[^a-zA-Z0-9_-]*')),
  -- json_valid keeps the column parseable. The b2c_ guard is a mechanical backstop
  -- against ever writing raw key material into a log line: auth.ts:88 shows every live
  -- key begins with that prefix, and no legitimate audit metadata contains it.
  metadata TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata) AND length(metadata) <= 4096 AND metadata NOT GLOB '*b2c_*'),
  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at))
) STRICT;

CREATE INDEX audit_events_by_account ON audit_events (account_id, created_at);

-- An audit log that can be edited or trimmed is not an audit log.
CREATE TRIGGER audit_events_are_append_only
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_event_is_append_only');
END;

CREATE TRIGGER audit_events_are_not_deletable
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_event_is_append_only');
END;
