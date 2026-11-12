# Incremental backup parsing design

## Current implementation

Browser backup JSON is parsed in a dedicated module Worker. This removes synchronous JSON tokenization from the UI thread, but the v1 format still materializes the parsed object in worker memory and structured-clones it back to the UI. It is not yet an incremental-memory solution.

## Target design: staged, record-at-a-time restore

1. Preserve the v1 JSON importer as a compatibility path. Introduce a versioned v2 streaming format with a small manifest followed by newline-delimited records: workspace, project, folder, file metadata, file content chunks, and a final manifest checksum.
2. Parse File.stream() in the Worker using a streaming UTF-8 decoder and bounded line buffer. Enforce maximum line, record, per-file, aggregate-content, and total-input sizes before allocating decoded content.
3. Validate metadata and hierarchy incrementally. Maintain bounded ID/reference sets for duplicate detection and referential integrity; reject unknown record types, malformed ordering, invalid base64/chunk lengths, and checksum mismatches.
4. Send batches through a MessageChannel to dedicated IndexedDB staging stores. Transfer ArrayBuffer ownership for binary chunks; do not post the complete backup object to the UI thread.
5. Show restore confirmation only after the manifest and all records pass validation. The live database remains untouched while parsing/staging.
6. On confirmation, promote staged records in one Dexie read-write transaction: clear live stores, bulk-write metadata, stream staged content in bounded batches, write preferences/workspaces, then clear staging stores. Any exception aborts the transaction and preserves the prior live data.
7. On cancellation, parse failure, quota error, or startup recovery, clear or resume staging using a persisted import ID and explicit staging state. Never silently promote an incomplete import.

## Memory and correctness invariants

- Peak parser memory is bounded by one record plus a bounded batch, not total backup size.
- The UI receives progress counters only, never document payloads.
- A checksum is verified before promotion; the live DB changes only after explicit confirmation.
- The v1 path remains available until v2 export/import compatibility is proven across supported releases.
- Fault-injection tests cover worker termination, malformed final record, quota/write failure during staging, cancellation, promotion rollback, and interrupted staging cleanup.

## Rollout gates

- Establish the v1 parse-time and heap baseline with the backup memory benchmark.
- Compare v2 peak memory and parse throughput on identical generated fixtures and representative user backups.
- Do not change the default export format until v2 restore is proven atomic and v1 backups remain restorable.
