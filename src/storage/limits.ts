/** Application-level limits. Values are byte counts (not character counts). */
export const MAX_IMPORT_FILE_SIZE_BYTES = 64 * 1024 * 1024;
export const MAX_PDF_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_FILE_SIZE_BYTES = 160 * 1024 * 1024;
export const MAX_BACKUP_INDIVIDUAL_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_TOTAL_CONTENT_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 100_000;

function formatMiB(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))} MiB`;
}

export function assertBackupFileSize(size: number): void {
  if (!Number.isFinite(size) || size < 0) throw new Error('The selected backup has an invalid file size.');
  if (size > MAX_BACKUP_FILE_SIZE_BYTES) {
    throw new Error(`This backup is too large to restore. The maximum backup size is ${formatMiB(MAX_BACKUP_FILE_SIZE_BYTES)}.`);
  }
}

export function assertImportFileSize(name: string, size: number, mimeType = ''): void {
  if (!Number.isFinite(size) || size < 0) throw new Error(`The file ${name} has an invalid file size.`);
  const isPdf = name.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf';
  const limit = isPdf ? MAX_PDF_FILE_SIZE_BYTES : MAX_IMPORT_FILE_SIZE_BYTES;
  if (size > limit) {
    throw new Error(`${name} is too large to import. ${isPdf ? 'PDF files' : 'Files'} are limited to ${formatMiB(limit)}.`);
  }
}
