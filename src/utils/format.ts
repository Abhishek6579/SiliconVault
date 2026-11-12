/** Format byte counts using the units used by the workspace UI. */
export function formatSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Only text-backed workspace content is editable as a string. */
export function fileText(data: Blob | string): string {
  return typeof data === 'string' ? data : '';
}
