# Secrets And Environment Routing

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## Doppler And Secret Routing

Load [`secrets-management.md`](../../operations/secrets-management.md) before adding or using secrets. Default to Doppler unless the founder selected another provider.

Refresh current Doppler official docs and `https://docs.doppler.com/llms.txt` before installation, setup, service-token, or CI/live-environment instructions. Record docs checked date, docs URLs, observed CLI version/install route, and any docs-vs-local mismatch in `SECRETS.md`.

Local check:

```bash
doppler --version
doppler setup
doppler run -- npm test
```

Rules:

- `doppler login` and account/project access are founder/operator actions when authentication is required.
- Run `doppler me` before secrets work to confirm the active account.
- **Config name preflight:** Before any `doppler run --project X --config Y` command, read the config name from `SECRETS.md` or run `doppler configs --project X`. Never guess from memory (e.g. "prod" vs "prd" differ by project and both are valid naming conventions).
- Use `doppler run -- <command>` for local commands that need secrets.
- Use Doppler service tokens, provider integrations, OIDC, or platform-native secrets for CI/live environments.
- Do not print `doppler secrets get --plain` output.
- **Env file extraction:** Never `source` a `.env`, `.p8`, or credential file. Use `awk -F= '/^KEY=/{print $2}' file` for single values. Do not commit awk/shell extraction snippets that print raw credential values to committed docs.
- **JS inside doppler run:** When the command contains JavaScript template literals (`${...}`), pass the script via a single-quoted heredoc (`doppler run -- node --input-type=module <<'NODE' ... NODE`) so bash does not expand template syntax before Doppler injects secrets.
- Update `SECRETS.md` whenever a new secret, `process.env`, webhook signing secret, provider key, service-account file, app-store credential, mobile build setting, or CI/deploy secret appears.
- Commit `.env.example` names only; never commit `.env`, private keys, service-account JSON, signing files, OAuth refresh tokens, or raw provider keys.
- **Session guard:** ship a `.claude/settings.json` `permissions.deny` block in every app repo. Deny Read, Edit, and Write access to `.env`, `.env.local`, `.env.*.local`, `secrets/**`, `*.pem`, `*.key`, `*.p8`, and `credentials*`. Treat this as one defense-in-depth layer, not a full guarantee. Keep the Doppler and no-print rules above as the primary control.
