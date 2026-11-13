/** Normalize an OS-provided relative path to slash-separated segments. */
export function normalizeRelativePath(path: string): string {
  const segments = path.replace(/[\\/]+/g, '/').split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Imported paths cannot move above the selected folder.');
  }
  return segments.join('/');
}

export function splitPath(path: string): string[] {
  const normalized = normalizeRelativePath(path);
  return normalized ? normalized.split('/') : [];
}

export function basename(path: string): string {
  return splitPath(path).at(-1) ?? '';
}

export function parentPath(path: string): string {
  return splitPath(path).slice(0, -1).join('/');
}

export function extname(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}
