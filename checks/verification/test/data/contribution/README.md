SYNTHETIC FIXTURE: this directory holds invented sources for the contribution-plan fixture suite.

# Contribution intake fixtures

Every file here is a labeled stand-in, never a real creator's material. The suite at
`checks/verification/fixtures/contribution-plan.fixtures.ts` reads these sources through the
real intake and asserts what the plan records. Nothing here is executed: `synthetic-skill/setup.sh`
would write `EXECUTED.marker` beside itself if it ever ran, and the suite proves that file never
appears.

| Path                             | Stands in for                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `synthetic-skill/`               | A skill that tells the agent to overwrite DESIGN.md, run a setup script, and register an MCP   |
| `synthetic-post.md`              | A design post with a heuristic and no license statement                                        |
| `synthetic-directive-post.md`    | A post whose closing section tells the agent to overwrite DESIGN.md, run a script, and publish |
| `synthetic-batch/repo-a/`        | A method README under an MIT license                                                           |
| `synthetic-batch/repo-b/`        | A Swift package under an Apache-2.0 license with a font that carries no license of its own     |
| `synthetic-github/recorded.json` | Recorded responses for an invented GitHub repository, served by an injected fetcher in tests   |

Hosts use `example.invalid`, which the source-freshness scan ignores. Re-record nothing here by
hand to make a test pass; change the intake or the assertion instead.
