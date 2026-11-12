# Performance benchmark methodology

Run with Node 22 after npm ci:

- npm run benchmark:storage runs a synthetic 30,000-row IndexedDB workload, measures cold database-open time, and compares compound-index queries with indexed-key-plus-filter scans.
- npm run benchmark:backup-memory records JSON parse time, payload size, heap delta, and RSS delta. Override BENCHMARK_FILES and BENCHMARK_FILE_BYTES to scale the fixture.

The benchmark output is diagnostic, not a performance guarantee. Record runner, Node version, row/file counts, and p50/p95 before making index or startup claims. Compare repeated runs on the same runner class; do not infer production latency from a single CI sample.
