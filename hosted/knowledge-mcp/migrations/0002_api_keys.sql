-- Migration 0002: API keys.
--
-- Replaces `policy.credentials` (auth.ts:9-16). Every field maps to a live invariant:
--
--   id                -> Principal.keyId, opaqueId, unique  (auth.ts:24, :46)
--   user_id           -> Principal.subject, opaqueId        (auth.ts:24)
--   sha256_hex        -> credential.sha256, unique digest   (auth.ts:7, :47)
--   scopes            -> array of at most one 'b2c:read'    (auth.ts:8)
--   revoked_at        -> credential.revoked                 (auth.ts:75)
--   expires_at        -> credential.expiresAt, optional     (auth.ts:15, :81)
--
-- Raw key material is never stored. Only the lowercase hex SHA-256 of the presented
-- key and a short display prefix are persisted, matching README's rule that the raw
-- owner key is never copied to the Worker.

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_-]*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- auth.ts:7 digest = /^[a-f0-9]{64}$/. The negated GLOB class rejects uppercase hex,
  -- so two spellings of one digest can never both exist and defeat the UNIQUE index.
  sha256_hex TEXT NOT NULL UNIQUE
    CHECK (length(sha256_hex) = 64 AND sha256_hex NOT GLOB '*[^0-9a-f]*'),

  -- auth.ts:8 z.array(z.literal('b2c:read')).max(1) has exactly two inhabitants.
  -- Storing the canonical JSON of each makes the column round-trip to the zod type.
  scopes TEXT NOT NULL CHECK (scopes IN ('[]', '["b2c:read"]')),

  -- Display only. Never enough material to reconstruct the key (auth.ts:88 requires 43
  -- further characters of entropy).
  key_prefix TEXT NOT NULL
    CHECK (key_prefix GLOB 'b2c_*' AND length(key_prefix) BETWEEN 5 AND 12
           AND key_prefix NOT GLOB '*[^a-zA-Z0-9_-]*'),
  label TEXT CHECK (label IS NULL OR length(label) BETWEEN 1 AND 120),

  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  revoked_at TEXT
    CHECK (revoked_at IS NULL OR revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', revoked_at)),
  expires_at TEXT
    CHECK (expires_at IS NULL OR expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', expires_at)),
  last_used_at TEXT
    CHECK (last_used_at IS NULL OR last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', last_used_at)),

  -- auth.ts:78 refuses a credential whose subject is not allowed. As a composite
  -- foreign key that rule becomes structural: a key cannot exist unless its subject
  -- holds a membership in the key's own account. Isolation stops depending on a
  -- WHERE clause somebody might forget to write.
  -- CASCADE, not NO ACTION: when a member is removed their live credentials must stop
  -- working in the same statement. The durable record of the key lives in audit_events,
  -- which carries no foreign key and therefore survives every lifecycle event here.
  FOREIGN KEY (account_id, user_id) REFERENCES memberships (account_id, user_id)
    ON DELETE CASCADE
) STRICT;

-- Console list path. Ordered by creation so the index also serves the sort.
CREATE INDEX api_keys_by_account ON api_keys (account_id, created_at);

-- policy.credentials had `.max(64)` (auth.ts:21). Revoked keys stay for audit and do
-- not consume the cap.
CREATE TRIGGER api_keys_cap_per_account
BEFORE INSERT ON api_keys
WHEN (SELECT count(*) FROM api_keys WHERE account_id = NEW.account_id AND revoked_at IS NULL) >= 64
BEGIN
  SELECT RAISE(ABORT, 'api_key_cap_exceeded');
END;

-- The tenant of a key is fixed for its lifetime. Without this, one careless UPDATE
-- moves a live credential into another account and every later isolation check passes.
-- The digest is fixed for the same reason: README states rotation is revoke-and-recreate,
-- and auth.ts:44 treats a digest change as invalidating prior OAuth grants.
CREATE TRIGGER api_keys_identity_is_immutable
BEFORE UPDATE ON api_keys
WHEN NEW.id <> OLD.id
  OR NEW.account_id <> OLD.account_id
  OR NEW.user_id <> OLD.user_id
  OR NEW.sha256_hex <> OLD.sha256_hex
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'api_key_identity_is_immutable');
END;

-- Revocation is terminal. auth.ts:75 has no path back from `revoked: true`, so an
-- un-revoke must not be reachable through the repository or through a manual fix.
CREATE TRIGGER api_keys_revocation_is_terminal
BEFORE UPDATE OF revoked_at ON api_keys
WHEN OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS NULL OR NEW.revoked_at <> OLD.revoked_at)
BEGIN
  SELECT RAISE(ABORT, 'api_key_revocation_is_terminal');
END;
