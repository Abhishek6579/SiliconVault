import { describe, expect, it } from 'vitest';
import { fileText, formatSize } from '../src/utils/format';

describe('workspace formatting helpers', () => {
  it('formats byte counts consistently at unit boundaries', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1023)).toBe('1023 B');
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('does not display invalid byte counts as valid storage usage', () => {
    expect(formatSize(-1)).toBe('—');
    expect(formatSize(Number.NaN)).toBe('—');
  });

  it('returns only string-backed content for text editors', () => {
    expect(fileText('note')).toBe('note');
    expect(fileText(new Blob(['binary']))).toBe('');
  });
});
