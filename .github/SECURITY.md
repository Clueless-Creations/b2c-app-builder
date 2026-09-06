# Reporting a vulnerability

This policy covers the B2C App Builder CLI, MCP server, workspace runtime, hosted knowledge adapter, validators, templates, starters, and package dependencies.

It does not cover an app created with the toolkit or a third-party service named in the knowledge library.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/Clueless-Creations/b2c-app-builder/security/advisories/new). Do not open a public issue for a security problem.

Include:

- the impact
- the required attacker access
- the affected file or command
- reproduction steps
- the version from `skill-version.json`

Do not include live credentials or personal data.

## Supported version

Security fixes target the current `main` version. Reports for an older version should confirm that the current version is also affected.

## In scope

- MCP workspace-registry bypass or path traversal
- unauthorized reducer or workspace mutation
- credential exposure in source, fixtures, templates, logs, or generated output
- unsafe defaults in a shipped template or starter
- command execution through parsed input or a validator
- hosted knowledge authorization bypass
- compromised or malicious package dependency

## Out of scope

- findings that require full control of the user's machine or agent runtime
- vulnerabilities in consumer apps created with the toolkit
- vulnerabilities in third-party services
- missing hardening with no demonstrated security impact

The maintainer will validate the report with the smallest relevant check before coordinating a fix.
