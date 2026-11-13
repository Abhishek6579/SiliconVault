import { describe, expect, it } from 'vitest';
import { duplicateKey, validateFileName } from '../src/domain/names';

describe('duplicateKey', () => {
  it('compares names without regard to case', () => {
    expect(duplicateKey('Notes.MD')).toBe(duplicateKey('notes.md'));
  });

  it('normalizes canonically equivalent Unicode names', () => {
    expect(duplicateKey('café.md')).toBe(duplicateKey('cafe\u0301.md'));
  });

  it('preserves compatibility characters that are not canonically equivalent', () => {
    expect(duplicateKey('notes.md')).not.toBe(duplicateKey('ｎｏｔｅｓ.md'));
  });
});

describe('validateFileName', () => {
  it('rejects names that are unsafe across supported operating systems', () => {
    for (const name of ['bad:name.md', 'trailing. ', 'CON.txt', ' leading.md']) {
      expect(() => validateFileName(name)).toThrow();
    }
  });

  it('keeps an existing file extension unchanged', () => {
    expect(() => validateFileName('report.pdf', 'report.md')).toThrow(/does not convert/);
    expect(() => validateFileName('REPORT.MD', 'report.md')).not.toThrow();
  });
});
