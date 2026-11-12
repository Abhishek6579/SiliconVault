import { assertBackupFileSize } from '../../storage/limits';

/** Parse the selected backup in a dedicated worker so JSON tokenization never blocks React. */
export async function parseBackupFile(file: File): Promise<unknown> {
  assertBackupFileSize(file.size);
  if (typeof Worker === 'undefined') {
    // Non-browser test/runtime fallback. Production browser builds always use the worker.
    return JSON.parse(await file.text()) as unknown;
  }
  const worker = new Worker(new URL('./backupParser.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ ok: true; value: unknown } | { ok: false; error: string }>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.value);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Could not parse the selected backup.'));
    };
    worker.postMessage(file);
  });
}
