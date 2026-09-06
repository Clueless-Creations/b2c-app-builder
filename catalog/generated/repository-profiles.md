<!-- catalog-generated:start repository-profiles -->
# Repository Profiles

Generated from catalog/repository-profiles/registry.ts. Edit the registry, not this file.

Launch scope (`essentials` / `full`) is a different field. Absence of a profile keeps current validator routing.

| Id | Title | Responsibility | Always canonical | README | Community files |
| --- | --- | --- | --- | --- | --- |
| `app-source` | App source repository | Own PRODUCT.md, app source, and the safety artifacts for capabilities this app uses. | `PRODUCT.md` | yes | no |
| `founder-operating` | Founder operating repository | Own reducer state, operating evidence, and safety artifacts. Do not require public OSS community files. | `state/business-state.json` | no | no |
| `public-package` | Public package repository | Own the public README and community health files plus the safety artifacts for capabilities this package uses. | `README.md` | yes | yes |
| `marketing-site` | Marketing site repository | Own the landing surface contract and the safety artifacts for capabilities this site uses. | `growth/landing/README.md` | yes | no |

<!-- catalog-generated:end repository-profiles -->
