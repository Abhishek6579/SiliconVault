import { describe, expect, it } from 'vitest';
import { normalizeRelativePath } from '../src/shared/utils/relativePath';

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
});
