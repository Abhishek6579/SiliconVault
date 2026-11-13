import { assertBackupFileSize } from '../../storage/limits';

export type BackupParseStage = 'Reading backup file in background…' | 'Parsing backup JSON in background…';

/** Parse the selected backup in a dedicated worker so JSON tokenization never blocks React. */
export async function parseBackupFile(file: File, onProgress?: (stage: BackupParseStage) => void): Promise<unknown> {
  assertBackupFileSize(file.size);
  if (typeof Worker === 'undefined') {
    onProgress?.('Reading backup file in background…');
    const text = await file.text();
    onProgress?.('Parsing backup JSON in background…');
    return JSON.parse(text) as unknown;
  }
  const worker = new Worker(new URL('./backupParser.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<
      { type: 'progress'; stage: BackupParseStage } |
      { type: 'result'; ok: true; value: unknown } |
      { type: 'result'; ok: false; error: string }
    >) => {
      if (event.data.type === 'progress') {
        onProgress?.(event.data.stage);
        return;
      }
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
