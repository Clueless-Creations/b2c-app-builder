# Design Room

This directory supplies schema and rendering support for the generated, read-only
Design Room review page. Root `DESIGN.md` and its linked authored files own an
app's design. Git owns revisions. The page presents the current design; it does
not own product decisions, execution state, or acceptance. Do not add a second
design-revision store.

The north-star architecture keeps design freedom in the business and selected
recipe. Platform-neutral component contracts map to explicit native adapters;
a schema or renderer does not establish implementation on every platform.

See the repository's [business-building guide](../../docs/guides/build-a-business.md)
and [architecture](../../docs/north-star-architecture.md).
