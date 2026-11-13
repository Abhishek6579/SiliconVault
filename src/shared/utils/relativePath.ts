/** Convert OS picker paths to a safe, separator-independent relative path. */
export function normalizeRelativePath(path: string): string {
  const segments = path.replace(/[\\/]+/g, '/').split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Imported paths cannot move above the selected folder.');
  }
  return segments.join('/');
}
