# Secrets Management

Use this before adding API keys, tokens, OAuth credentials, webhook signing secrets, service-account files, store credentials, CI/deploy environment variables, `.env` files, or secret-bearing provider setup. Load `provider-state-recipes.md` when the secret belongs to a third-party service setup.

Before marking this lane done, load [`provider-proof.md`](../process/provider-proof.md): provider-backed readiness needs live proof or a recorded founder-only decision in `operations/PROVIDER_PROOF.md`, never setup prose alone.

During broad business setup, load `founder-zero-operator.md` first. Explain Doppler in plain language, ask for only the login/approval step the founder must perform, then let the agent inventory projects/configs, route secret names, run safe proof, and continue. Doppler manages automation secrets; interactive browser passwords/passkeys stay with platform delegation, the founder's password manager, or a founder-authenticated session.

Default to Doppler when the founder has not selected another secret manager. Load [`paid-tool-routing.md`](paid-tool-routing.md) before replacing Doppler or another paid/account-gated secret manager with Apple Keychain, platform secrets, local `.env`, or manual exports.

## Contents

- Live Documentation Gate
- Required Artifacts
- Secret Discovery Loop
- Classification
- Doppler Workflow
- Alternatives And Fallbacks
- Production Readiness Gates
- Common Failure Modes

## Live Documentation Gate

Refresh current provider docs before installing, configuring, writing commands, creating service tokens, wiring CI/deploy injection, or calling a Doppler setup complete. Prefer Doppler's official docs and `https://docs.doppler.com/llms.txt` over local examples, memory, old transcripts, or prior agent output.

Required Doppler sources:

- Doppler CLI install: `https://docs.doppler.com/docs/install-cli`
- Doppler CLI guide: `https://docs.doppler.com/docs/cli`
- Doppler secrets setup guide: `https://docs.doppler.com/docs/secrets-setup-guide`
- Doppler service tokens: `https://docs.doppler.com/docs/service-tokens`
- Doppler AI docs index: `https://docs.doppler.com/llms.txt`
- Target deploy provider docs for secrets: Cloudflare, Vercel, Netlify, Supabase, GitHub Actions, EAS, Xcode Cloud, Firebase, or app-store provider docs as applicable

Record in `SECRETS.md`:

- docs checked date
- docs URLs used
- observed install route and CLI version, when available
- project/config mapping source
- command differences between live docs, local CLI help, this skill, or old project docs
- live-environment auth model: service token, provider integration, OIDC, or platform-native secret store

Also record the matching provider state in `state/business-state.json`: docs checked date, required secret names, access route in use (`access_route`), preflight, validation command/proof, fallback limitation, and blocked founder actions.

If current official docs or CLI help cannot be reached, mark setup as `blocked: docs refresh needed` or `provisional: docs unavailable`. Do not invent install, login, service-token, or deploy commands from memory.

## Required Artifacts

Create or update `SECRETS.md` whenever any service in the launch needs a secret or environment variable.

`SECRETS.md` must include:

- selected secret provider: Doppler by default, or founder-approved alternative
- provider docs basis: docs checked date, official URLs, install route, and observed CLI version when available
- secret inventory: variable name, service, class, environment, runtime surface, public/server-only status, owner, rotation note, and status
- Doppler project/config map or alternate provider location for each environment
- command map: local dev, tests, build, deploy, migrations, webhook replay, store/CLI automation, and support scripts
- CI/deploy map: where staging and production secrets are injected
- new-secret routing log: what introduced the secret, where it was stored, which docs/tests were updated, and who owns it
- blocked founder actions: secrets or account steps the agent cannot complete
- proof notes: secret-manager location and command evidence, never raw values
- corresponding `state/business-state.json` provider status for every material provider

Recommended repo files:

- `SECRETS.md`: committed, names and locations only
- `doppler.yaml`: committed only when it contains non-secret project/config/path hints
- `.env.example`: committed names only, no values
- `.env`, `.env.local`, `.env.*.local`, service-account JSON, `.p8`, `.p12`, `.mobileprovision`, raw keys, tokens, and downloaded credential files: ignored or stored outside git

Use `business/trust/secrets/` as a starting point when available.

## Secret Discovery Loop

When a new secret appears during research, setup, or implementation:

1. Stop and classify it before writing code around it.
2. Add the name to `SECRETS.md` with service, class, environment, runtime surface, owner, and status.
3. Route it to Doppler or the founder-approved provider before running commands that require it.
4. Update `.env.example` with the name only when the repo needs a local schema.
5. Update `AGENTS.md`, `engineering/TECH_SPEC.md`, `engineering/ENGINEERING_PLAN.md`, provider ops docs, and `engineering/PRODUCTION_READINESS.md` if behavior or verification changes.
6. Update `state/business-state.json`.
7. Run or record a secret scan before handoff.

Do not leave new secrets as ad hoc shell exports, pasted chat values, committed `.env` values, screenshots, raw logs, or untracked setup steps.

## Classification

Use these classes in `SECRETS.md`:

- `public_client_config`: documented public tokens or IDs safe for client bundles, such as publishable analytics/project tokens when vendor docs say so
- `server_secret`: API keys, database URLs, admin tokens, private provider keys, and service-role credentials
- `webhook_signing_secret`: Resend, Stripe, RevenueCat, PostHog, GitHub, or store notification signing secrets
- `store_credential`: App Store Connect keys, Play service-account JSON, ASC issuer/key IDs, private `.p8` files, signing material, provisioning credentials
- `oauth_or_refresh_token`: OAuth refresh tokens, social account tokens, connected account sessions
- `ci_deploy_secret`: deploy tokens, CI service tokens, cloud account tokens, `DOPPLER_TOKEN`
- `runtime_user_secret`: app user tokens that belong in platform secure storage such as Apple Keychain or Android Keystore
- `local_operator_secret`: local-only CLI credentials or personal tokens used by the founder/operator

Public does not mean harmless. If a token can write, mutate, impersonate, bill, send email, read private data, or access admin APIs, it is server-only.

## Doppler Config Preflight And Shell Patterns

**Config name preflight (never guess):** Before constructing any `doppler run --project <name> --config <config>` command, resolve the actual config name. Config names are project-specific and do not follow a universal convention — "prod" and "prd" are both common and the wrong one causes a hard error. Resolve in this priority order:

1. Read the project's `SECRETS.md` config map — it is the canonical record.
2. Read `store/STORE_CONSOLE.md` if it contains Doppler snippets; those snippets are written from a working session.
3. Run `doppler configs --project <name>` to list all real config names in the project.
   Never construct a `doppler run` command with a config name sourced from memory, a different project's docs, or a prior session transcript. Record the resolved config name in `SECRETS.md` if it is missing.

**Doppler preflight check:** Run `doppler me` to confirm the local CLI is authenticated and the expected account is active before any secrets work. A missing or wrong account is a silent failure that produces confusing auth errors downstream.

**Env file extraction — never `source`:** Do not run `source` or `.` on `.env` files that contain prose comments, export-less assignments, or multi-line values (such as `.p8` or PEM keys). Shell attempts to execute each line as a command, so a comment line or a value with spaces causes "command not found" errors and may execute unintended commands. Use awk for single-value extraction:

```bash
VAR=$(awk -F= '/^KEY_NAME=/{print $2}' /path/to/file.env)
```

For multiline values such as a `.p8` private key, never extract the raw value into a shell variable or print it. Read the file path directly or route through Doppler. Document the extraction command in `SECRETS.md`; do not commit awk/grep extraction snippets that print raw credential values in `store/STORE_CONSOLE.md` or any committed markdown.

**JS template literals inside `doppler run -- bash -lc`:** When a command passed to `doppler run -- bash -lc '...'` contains JavaScript template literals (`${...}`, `` `...` ``), the outer bash shell expands the `${...}` before Doppler injects secrets, causing "bad substitution" or silent empty-string substitution. Use one of these patterns instead:

- Use a single-quoted heredoc to pass a Node script (`doppler run -- node --input-type=module <<'NODE' ... NODE`). Single-quoting the heredoc delimiter prevents bash expansion; Doppler injects environment variables and Node sees them as `process.env.*`.
- Rewrite the JS template literals as string concatenation before passing to bash.
- Write the script to a temp file and invoke it: `doppler run -- node /tmp/script.mjs`.
  Do not nest multi-line JavaScript containing template literals inside a double-quoted or unquoted bash heredoc passed to `doppler run`.

## Doppler Workflow

Local development:

- Refresh the Live Documentation Gate before installation or setup.
- Verify install with the current official command, usually `doppler --version`, and record the observed version or missing-binary status.
- If missing and the founder selected Doppler, install from current official docs or ask if global install is not appropriate.
- Authenticate locally with `doppler login`; this is a founder/operator action when browser login or account access is required.
- Run `doppler me` to confirm the active account before secrets work.
- Run `doppler setup` at the repo root or configured app folder. Use `doppler.yaml` only for non-secret project/config/path hints.
- Before constructing `doppler run --project X --config Y`, verify the config name from `SECRETS.md`, `store/STORE_CONSOLE.md`, or `doppler configs --project X`. Never guess the config name.
- Run commands as `doppler run -- <command>`, for example `doppler run -- pnpm dev`, `doppler run -- npm test`, or `doppler run -- wrangler deploy`.
- Use `doppler run --watch -- <command>` only when the plan supports it and the current Doppler plan/docs allow it.
- For one-off command strings that reference variables, escape variables or use single quotes so the shell does not expand before Doppler injects values.
- When the command contains JavaScript template literals, use a single-quoted Node heredoc (`doppler run -- node --input-type=module <<'NODE' ... NODE`) instead of passing JS through `bash -lc`.

Secret visibility (masked vs restricted):

- Set automation-consumed secrets with the **default `masked`** visibility (plain `doppler secrets set SECRET_NAME`, no `--visibility` flag).
- Do **not** use `--visibility restricted` for secrets that automation reads: restricted secrets are invisible to CLI injection (`doppler run --`) and produce errors like "The current authentication does not have access to restricted secrets," forcing every secret to be re-created. Reserve `restricted` for dashboard-/API-only secrets that never need CLI injection.
- Any config consumed by `wrangler deploy`, Expo, CI, or another `doppler run --` consumer must use `masked`.

wrangler.toml / committed config (never plaintext credentials):

- `wrangler.toml`/`wrangler.json` `[vars]` (and `next.config.js`/`app.json` env blocks) must not contain real credential values (Supabase URL/keys, API keys). Route them through `wrangler secret put` or Doppler-injected env vars and keep `[vars]` for non-secret config only. `check:secrets` scans `.toml`/config files for credential-shaped values; a hit is the `wrangler-toml-credentials-committed` failure card. Audit git history if a credential was ever committed.

Setting and reading:

- Prefer setting secrets through the Doppler dashboard or `doppler secrets set SECRET_NAME` without exposing values in command history or logs.
- Do not run `doppler secrets get SECRET_NAME --plain` unless absolutely necessary; never paste or print the result into docs, chats, commits, screenshots, or logs.
- If a secret value is needed and unavailable, mark a founder action instead of inventing a placeholder that may ship.

CI and production:

- Refresh the Doppler service-token docs and target deploy-provider secret docs before writing production instructions.
- Use Doppler service tokens, provider integrations, or OIDC identities for non-local environments.
- Service tokens should be read-only where possible and scoped to one project/config.
- Store `DOPPLER_TOKEN` only in the CI/deploy provider secret store or runtime secret store.
- Do not use personal tokens or local CLI tokens in live environments.
- If a service token is rotated, update the provider secret and rerun the verification command.

## Alternatives And Fallbacks

Allowed alternatives after founder confirmation:

- Apple Keychain, Android Keystore, or secure storage for runtime user tokens on device
- macOS Keychain for local operator-only CLI credentials
- GitHub Actions secrets, Cloudflare secrets, Vercel/Netlify/Supabase/Firebase secrets, Xcode Cloud secrets, or platform-native secret stores for deploy/runtime
- `.env.local` or manual shell exports only as a temporary local fallback, recorded as lower confidence in `SECRETS.md` and never committed

Do not treat Apple Keychain as a replacement for server-side secret management. It is appropriate for local machine credentials or app runtime user secrets, not for committed app configuration or cloud production secrets.

## Claude Code Sandbox And Local Secret Files

A `permissions.deny` rule on the Read tool blocks only the Read tool. It does not stop a Bash subprocess from reading the same file. Route `.env`, `.p8`, and service-account files through `sandbox.credentials.files` instead. Give each path as an absolute path, never a glob. Pair that setting with a `PreToolUse` hook on Bash that blocks readers such as `cat`, `head`, `grep`, `base64`, and `cp`. Leave `source .env` alone, so normal local development still works. Record the chosen deny mechanism in `SECRETS.md`.

## Production Readiness Gates

Before beta, store submission, or production launch:

- `SECRETS.md` exists and every secret-bearing service is represented.
- No raw secret values appear in git, docs, screenshots, logs, or proof artifacts.
- `.gitignore` blocks local env files and credential artifacts.
- Local commands that require secrets are documented with `doppler run --` or the approved provider command.
- CI/deploy/runtime environments have secrets injected from Doppler or an approved provider.
- Production uses service tokens/provider integrations/OIDC, not personal CLI tokens.
- Frontend bundles expose only documented public client config.
- Release/staging builds prove mocks are disabled and secrets are not bundled.
- Rotation/revocation notes exist for live keys, webhook secrets, social/Fastlane keys, store credentials, and deploy tokens.
- `state/business-state.json` shows provider status and required secret names without exposing values.

## Common Failure Modes

Flag these aggressively:

- a new `process.env`, `import.meta.env`, `DartDefine`, `xcconfig`, `Info.plist`, GitHub Actions secret, Cloudflare secret, or mobile build setting appears without a `SECRETS.md` update
- `.env.example` contains real-looking values instead of names or safe placeholders
- production setup uses a Doppler personal/CLI token instead of a service token, provider integration, or OIDC
- `doppler secrets get --plain` output is printed into logs or proof
- a public `NEXT_PUBLIC_`, `PUBLIC_`, `EXPO_PUBLIC_`, or mobile plist value contains a server secret
- service-account JSON, `.p8`, `.p12`, provisioning files, SSH keys, or OAuth refresh tokens are committed
- CI/deploy works only from a developer shell because the agent forgot launch-time environment differs from interactive shell
- `state/business-state.json` says provider setup is done even though `SECRETS.md`, CI injection, or command wrappers are missing
- `doppler run --config` uses a guessed config name (such as "prod" instead of "prd") without reading `SECRETS.md` or running `doppler configs` first
- `source` or `.` is used on a `.env` or credential file containing prose, multiline values, or non-POSIX assignment syntax
- a committed markdown file (`store/STORE_CONSOLE.md` or similar) contains an awk/grep/shell snippet that extracts and prints a raw credential value from a `.env` or `.p8` file
- JavaScript template literals are nested inside a double-quoted bash heredoc passed to `doppler run -- bash -lc`, causing silent bash expansion before Doppler injection
