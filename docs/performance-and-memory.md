# Performance and memory measurements

## Backup JSON parsing baseline

The desktop WebView restore path currently calls `file.text()` and then `JSON.parse()`. During parsing, the decoded JSON string and the complete object graph coexist. This can amplify peak memory relative to the on-disk backup size.

Run a reproducible Node baseline:

```sh
node --expose-gc scripts/benchmarks/backup-memory.mjs
node --expose-gc scripts/benchmarks/backup-memory.mjs "" 32
node --expose-gc scripts/benchmarks/backup-memory.mjs path/to/backup.json
```

The benchmark reports elapsed time, heap delta, RSS delta, and heap amplification. Compare results on the same Node version and machine; do not compare RSS across different runners as a strict regression threshold.

## Remaining work: bounded backup parsing

This benchmark measures the current whole-file parser; it does not make parsing streaming. A future parser must:
- Read bounded chunks from `File.stream()`.
- Parse top-level metadata and each `files[]` entry incrementally.
- Validate file metadata, encoded length, decoded byte count, and SHA-256 before the import transaction commits.
- Keep a bounded number of decoded content records in memory.
- Preserve the existing all-or-nothing import semantics and rollback behavior.
- Reject malformed/truncated JSON and cancellation without changing live data.

Do not replace the current parser with `Response.json()`; it still materializes the complete JSON value.

## Measurement policy

Capture a baseline and a candidate run for the same fixture size. Record runtime, backup bytes, heap delta, RSS delta, and amplification. Add a CI regression threshold only after repeated runner measurements establish stable variance.
