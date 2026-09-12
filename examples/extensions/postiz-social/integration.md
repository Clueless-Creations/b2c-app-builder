# Postiz API integration boundary

This package records a source/fixture-first qualification for the Postiz public API v1. The official API documents create-post requests with `type` values `draft`, `schedule`, and `now`, returns `postId` and `integration`, and exposes list and delete post operations. Provider settings are platform-specific and stay at this boundary.

## Native-to-extension mapping

| Native capability | Extension operation | Effect | Evidence | Disposition |
| --- | --- | --- | --- | --- |
| `POST /public/v1/posts` with `type: draft` | `postiz-social/posts.draft` | draft | Official API example plus fake transport fixture | Implemented as a manual boundary; no live route |
| `POST /public/v1/posts` with `type: schedule` | `postiz-social/posts.schedule` | publish | Official API example plus approval/readback contract | Declared extension; founder-gated and unimplemented live |
| `GET /public/v1/posts` | `postiz-social/posts.list` | observe | Official API index plus fake transport fixture | Manual read boundary; no live route |
| `DELETE /public/v1/posts/:id` | `postiz-social/posts.delete` | destructive | Official API index plus reconciliation contract | Declared extension; founder-gated and unimplemented live |

The package does not add a canonical social operation because the provider's platform-specific settings and account model are not yet a reusable builder semantic. It does not vendor the Postiz agent CLI or any Postiz application bytes. The CLI is separately licensed AGPL-3.0; this package uses no CLI code.

Authentication may use Postiz OAuth or an API key. Credentials, account connections, target selection, provider setup, scheduling, publishing, and deletion remain outside this package. A fake transport can prove request classification and boundary behavior; it cannot prove live support.

## Recovery and authority

An uncertain create, schedule, or delete response must be reconciled with a read before retry. A missing local success record is not proof that Postiz did nothing. Scheduling and deletion require a fresh founder approval envelope for the exact integration and post target. Drafting produces an unaccepted candidate for independent review.

The boundary refuses a missing or ambiguous upstream contract, refuses publish or schedule side effects during drafting, refuses effectful work without the exact approval envelope, and never retries an uncertain write blindly. An explicitly selected alternate social provider remains selected; no Postiz-specific setup or call is made when Postiz is not selected.

Sources reviewed: the official [Create Post](https://docs.postiz.com/public-api/posts/create) page, the [Postiz public API index](https://docs.postiz.com/public-api/introduction), and the official [Postiz agent repository](https://github.com/gitroomhq/postiz-agent). These are qualification sources, not executable dependencies.
