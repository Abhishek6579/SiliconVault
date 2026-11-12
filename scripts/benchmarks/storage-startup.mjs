import http from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const DEXIE_PATH = require.resolve('dexie/dist/dexie.js');

const CONFIG = {
  rows: Number(process.env.BENCHMARK_ROWS ?? 30000),
  samples: Number(process.env.BENCHMARK_SAMPLES ?? 200),
  warmup: Number(process.env.BENCHMARK_WARMUP ?? 20),
  batchSize: 2000,
};

// IndexedDB needs a real origin, so serve a blank page locally.
const server = http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><body></body></html>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('console', (m) => process.stderr.write(`[page] ${m.text()}\n`));
  page.on('pageerror', (e) => process.stderr.write(`[error] ${e.message}\n`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.addScriptTag({ path: DEXIE_PATH });

  const report = await page.evaluate(runBenchmark, CONFIG);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
  server.close();
}

// Runs inside the browser. Must be self-contained.
async function runBenchmark({ rows: ROWS, samples, warmup, batchSize }) {
  const WS = 'workspace-hot';
  const PROJ = 'project-archive';
  const ARCHIVE_AT = 1_700_000_000_000;
  const round = (x) => Number(x.toFixed(3));
  const log = (msg) => console.log(msg);

  // Deterministic dataset.
  const data = Array.from({ length: ROWS }, (_, i) => ({
    id: `file-${i}`,
    workspaceId: i % 3 === 0 ? WS : `workspace-${i % 17}`,
    projectId: i % 10 === 0 ? PROJ : `project-${i % 31}`,
    deletedAt: i % 10 === 0 ? ARCHIVE_AT : i % 7 === 0 ? ARCHIVE_AT + i : null,
  }));

  // Ground truth computed in plain JS, independent of IndexedDB.
  const truth = {
    trash: data.filter((f) => f.workspaceId === WS && f.deletedAt !== null).length,
    restore: data.filter((f) => f.projectId === PROJ && f.deletedAt === ARCHIVE_AT).length,
  };

  const dbName = `bench-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const db = new Dexie(dbName);
  db.version(1).stores({
    files: '&id, workspaceId, projectId, deletedAt, [workspaceId+deletedAt], [projectId+deletedAt]',
  });

  const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];

  function summarize(label, times, result) {
    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const stdev = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length);
    return {
      label,
      result,
      samples: times.length,
      meanMs: round(mean),
      stdevMs: round(stdev),
      minMs: round(sorted[0]),
      p50Ms: round(pct(sorted, 0.5)),
      p95Ms: round(pct(sorted, 0.95)),
      p99Ms: round(pct(sorted, 0.99)),
      maxMs: round(sorted[sorted.length - 1]),
    };
  }

  async function measure(label, op, expected) {
    for (let i = 0; i < warmup; i++) await op();
    const times = [];
    let result;
    for (let i = 0; i < samples; i++) {
      const t = performance.now();
      result = await op();
      times.push(performance.now() - t);
    }
    if (result !== expected) {
      throw new Error(`${label}: got ${result}, expected ${expected}. Benchmark invalid.`);
    }
    log(`done: ${label}`);
    return summarize(label, times, result);
  }

  try {
    // Setup, timed separately and not part of query samples.
    const openStart = performance.now();
    await db.open();
    const openMs = round(performance.now() - openStart);

    const insertStart = performance.now();
    const files = db.table('files');
    for (let i = 0; i < data.length; i += batchSize) {
      await files.bulkAdd(data.slice(i, i + batchSize));
    }
    const insertMs = round(performance.now() - insertStart);
    log(`inserted ${ROWS} rows in ${insertMs}ms`);

    const queries = [
      await measure('workspace-trash-index', () =>
        files.where('[workspaceId+deletedAt]')
          .between([WS, 0], [WS, Dexie.maxKey]).count(), truth.trash),
      await measure('workspace-trash-scan', () =>
        files.where('workspaceId').equals(WS)
          .filter((f) => f.deletedAt !== null).count(), truth.trash),
      await measure('project-restore-index', () =>
        files.where('[projectId+deletedAt]')
          .equals([PROJ, ARCHIVE_AT]).count(), truth.restore),
      await measure('project-restore-scan', () =>
        files.where('projectId').equals(PROJ)
          .filter((f) => f.deletedAt === ARCHIVE_AT).count(), truth.restore),
    ];

    return {
      benchmark: 'silicon-vault-storage',
      environment: { userAgent: navigator.userAgent },
      config: { rows: ROWS, samples, warmup, batchSize },
      openMs,
      insertMs,
      queries,
    };
  } finally {
    db.close();
    await Dexie.delete(dbName);
  }
}