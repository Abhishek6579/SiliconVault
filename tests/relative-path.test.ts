import { describe, expect, it } from 'vitest';
import { basename, extname, normalizeRelativePath, parentPath, splitPath } from '../src/domain/paths';

describe('normalizeRelativePath', () => {
  it('normalizes mixed Windows and POSIX separators', () => {
    expect(normalizeRelativePath('folder\\nested/file.md')).toBe('folder/nested/file.md');
  });

  it('collapses repeated separators and current-directory segments', () => {
    expect(normalizeRelativePath('./folder///file.md')).toBe('folder/file.md');
  });

  it('preserves Unicode names', () => {
    expect(normalizeRelativePath('資料/notes.md')).toBe('資料/notes.md');
  });

  it('rejects parent traversal', () => {
    expect(() => normalizeRelativePath('folder/../outside.md')).toThrow(/above the selected folder/);
  });

  it('splits normalized paths and handles empty input', () => {
    expect(splitPath('a\\b/c.md')).toEqual(['a', 'b', 'c.md']);
    expect(splitPath('')).toEqual([]);
  });

  it('returns filename, parent, and extension from either separator style', () => {
    expect(basename('a\\b/report.tar.gz')).toBe('report.tar.gz');
    expect(parentPath('a\\b/report.tar.gz')).toBe('a/b');
    expect(extname('a\\b/report.tar.gz')).toBe('.gz');
    expect(extname('a\\b/.env')).toBe('');
  });
});
