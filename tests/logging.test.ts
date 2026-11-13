import { describe, expect, it } from 'vitest';
import { errorContext } from '../src/shared/logging/errorContext';
import { sanitizeDiagnosticText } from '../src/shared/logging/sanitize';

describe('diagnostic logging safeguards', () => {
  it('redacts credentials, contact details, and control characters', () => {
    const value = sanitizeDiagnosticText('password=hunter2 Bearer abc.def token=https://x.test/?access_token=abc user=test@example.com\u0000', 512);
    expect(value).not.toContain('hunter2');
    expect(value).not.toContain('abc.def');
    expect(value).not.toContain('access_token=abc');
    expect(value).not.toContain('test@example.com');
    expect(value).not.toContain('\u0000');
  });

  it('bounds logged text', () => {
    expect(sanitizeDiagnosticText('x'.repeat(100), 12)).toHaveLength(12);
  });

  it('captures useful Error details and safely handles uninspectable values', () => {
    expect(errorContext(new Error('broken'))).toMatchObject({ errorName: 'Error', errorMessage: 'broken' });
    const hostile = { toString() { throw new Error('do not reveal'); } };
    expect(errorContext(hostile)).toEqual({ errorName: 'UnknownError', errorMessage: 'The error value could not be inspected.' });
  });
});
