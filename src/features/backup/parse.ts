import { assertBackupFileSize } from '../../storage/limits';

/** Check the browser File metadata before allocating its full text representation. */
export async function parseBackupFile(file: File): Promise<unknown> {
  assertBackupFileSize(file.size);
  return JSON.parse(await file.text()) as unknown;
}
