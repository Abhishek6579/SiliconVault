import { File } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

if (typeof globalThis.gc !== 'function') {
  throw new Error('Run with --expose-gc: node --expose-gc scripts/benchmarks/backup-memory.mjs [backup.json] [synthetic-MiB]');
}

const inputPath = process.argv[2];
const syntheticMiB = Math.max(1, Number(process.argv[3] ?? 8));
let bytes;
if (inputPath) {
  bytes = await readFile(inputPath);
} else {
  const payloadBytes = syntheticMiB * 1024 * 1024;
  const now = Date.now();
  const metadata = {
    id: 'memory-benchmark-file',
    kind: 'text',
    name: 'memory-benchmark.txt',
    parentFolderId: null,
    projectId: null,
    size: payloadBytes,
    mimeType: 'text/plain',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const prefix = JSON.stringify({
    format: 'engineering-workspace-backup',
    version: 1,
    exportedAt: now,
    files: [{ meta: metadata, content: { encoding: 'text', value: '' }, sha256: '0'.repeat(64) }],
    folders: [],
    projects: [],
    preferences: [],
    workspaces: [],
  });
  const valueKey = '"value":""';
  const index = prefix.indexOf(valueKey);
  if (index < 0) throw new Error('Could not build synthetic backup fixture.');
  const payload = prefix.slice(0, index) + '"value":"' + 'x'.repeat(payloadBytes) + '"' + prefix.slice(index + valueKey.length);
  bytes = Buffer.from(payload);
}

const file = new File([bytes], inputPath ? 'backup.json' : 'synthetic-backup.json', { type: 'application/json' });
globalThis.gc();
const before = process.memoryUsage();
const started = performance.now();
const text = await file.text();
const parsed = JSON.parse(text);
const elapsedMs = performance.now() - started;
globalThis.gc();
const after = process.memoryUsage();
const heapDelta = Math.max(0, after.heapUsed - before.heapUsed);
const rssDelta = Math.max(0, after.rss - before.rss);

console.log(JSON.stringify({
  input: inputPath ?? `synthetic ${syntheticMiB} MiB`,
  backupBytes: file.size,
  parsedFileRecords: Array.isArray(parsed.files) ? parsed.files.length : null,
  elapsedMs: Math.round(elapsedMs),
  heapDeltaBytes: heapDelta,
  rssDeltaBytes: rssDelta,
  heapAmplification: Number((heapDelta / Math.max(1, file.size)).toFixed(2)),
  note: 'Heap delta includes the decoded JSON string and parsed object retained together; RSS delta is process-level and can include allocator effects.',
}, null, 2));
