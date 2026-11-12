import 'fake-indexeddb/auto';
import Dexie from 'dexie';

const DB_NAME = `silicon-vault-benchmark-${Date.now()}`;
const ROWS = Number(process.env.BENCHMARK_ROWS ?? 30000);
const WORKSPACE = 'workspace-hot';
const PROJECT = 'project-archive';
const ARCHIVE_AT = 1_700_000_000_000;
const database = new Dexie(DB_NAME);
database.version(1).stores({ files: '&id, workspaceId, projectId, deletedAt, [workspaceId+deletedAt], [projectId+deletedAt]' });

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}
async function measure(label, operation, iterations = 30) {
  const samples = [];
  let result;
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    result = await operation();
    samples.push(performance.now() - start);
  }
  return { label, result, p50Ms: Number(percentile(samples, .5).toFixed(3)), p95Ms: Number(percentile(samples, .95).toFixed(3)) };
}

try {
  const startupStart = performance.now();
  await database.open();
  const startupMs = Number((performance.now() - startupStart).toFixed(3));
  const rows = Array.from({ length: ROWS }, (_, index) => ({
    id: `file-${index}`,
    workspaceId: index % 3 === 0 ? WORKSPACE : `workspace-${index % 17}`,
    projectId: index % 10 === 0 ? PROJECT : `project-${index % 31}`,
    deletedAt: index % 10 === 0 ? ARCHIVE_AT : index % 7 === 0 ? ARCHIVE_AT + index : null,
    updatedAt: index + 1,
  }));
  await database.table('files').bulkAdd(rows);
  const indexedTrash = await measure('workspace-trash-index', () => database.table('files').where('[workspaceId+deletedAt]').between([WORKSPACE, 0], [WORKSPACE, Dexie.maxKey]).count());
  const scannedTrash = await measure('workspace-trash-filter-scan', () => database.table('files').where('workspaceId').equals(WORKSPACE).filter((file) => file.deletedAt !== null).count());
  const indexedRestore = await measure('project-restore-index', () => database.table('files').where('[projectId+deletedAt]').equals([PROJECT, ARCHIVE_AT]).count());
  const scannedRestore = await measure('project-restore-filter-scan', () => database.table('files').where('projectId').equals(PROJECT).filter((file) => file.deletedAt === ARCHIVE_AT).count());
  if (indexedTrash.result !== scannedTrash.result || indexedRestore.result !== scannedRestore.result) throw new Error('Indexed and scan query results differ; benchmark is invalid.');
  process.stdout.write(JSON.stringify({ benchmark: 'silicon-vault-storage', rows: ROWS, startupMs, queries: [indexedTrash, scannedTrash, indexedRestore, scannedRestore] }, null, 2) + '\n');
} finally {
  database.close();
  await database.delete();
}
