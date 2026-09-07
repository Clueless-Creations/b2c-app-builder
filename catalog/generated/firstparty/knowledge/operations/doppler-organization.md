# Doppler organization across a portfolio

Load when setting up secrets for a new business, adding a second business to an
existing account, or deciding where a newly required credential belongs.

## The rule

**One project per business. One shared `b2c` project for everything account-level.
Repos map to configs, never to projects.**

A credential belongs in `b2c` when one account serves every business (a
Resend account hosting many sending domains, one Anthropic key, one App Store
Connect key, one Cloudflare token). It belongs in the business project when it is
that business's own (its Supabase keys, its RevenueCat app key, its PostHog
project key, its store identifiers).

## Why not a project per repo

A business with web + Flutter + backend repos does not want three projects. Web
and Flutter share the same client-safe values (Supabase URL, anon key, analytics
project key); splitting by repo duplicates them and they drift. And per-repo
projects still do not stop a server secret being pasted into the mobile one.

The boundary that matters is not _which repo_ — it is **can this token read a
server secret**. Configs express that directly:

| Config       | Holds                                           | Consumed by                 |
| ------------ | ----------------------------------------------- | --------------------------- |
| `prd` (root) | client-safe + business-shared                   | web, mobile                 |
| `prd_server` | adds service-role keys, webhook signing secrets | backend, scheduled sessions |
| `prd_ci`     | adds deploy and store credentials               | CI                          |

A branch config inherits its environment's root config, so `prd_server` sees
everything in `prd` plus its own. A token scoped to `prd` cannot see the branch
extras. That inheritance is core Doppler behavior, available on every plan.

## Composing the shared account tier

Cross-project inheritance (`doppler configs update --inherits`) is a paid-tier
feature. Do not depend on it. Compose at the consumer instead — this works on
every plan and keeps the precedence rule in code we can test:

```bash
doppler run -p <account> -c <config> -- doppler run -p <business> -c <config> -- <command>
```

The inner injection wins, so a business may override a shared account-tier value. The
provisioning resolver applies the same precedence when it checks which
requirements are satisfied.

## Naming and binding

Projects are named for the business slug (`clueless-clothing`, `shade-diary`).
Configs are `dev` / `stg` / `prd` plus the `prd_server` / `prd_ci` branches.
Conventions drift in real accounts, so the workspace control file records the
project and config this business actually binds to — a business whose project
predates the convention keeps working without a rename.

Bind the workspace directory once so ordinary commands need no flags:

```bash
doppler setup --project <business> --config prd_server --no-interactive
```

## Constraints worth knowing before you plan

- **Inheritance and tokens are per workplace.** A single shared `b2c` project can
  only serve businesses in the same workplace. Businesses split across two
  workplaces cannot share it; consolidate before building the shared tier.
- **Service tokens are per config.** Automation gets a read-only service token
  scoped to one config, never a personal login token.
- **Creating projects and tokens is an account mutation** — a founder-gated
  action. Propose the exact commands; let the founder run or approve them.
