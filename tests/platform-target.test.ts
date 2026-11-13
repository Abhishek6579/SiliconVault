import { describe, expect, it } from 'vitest';
import { supportsWindowsX64Updater } from '../src/platform/target';

describe('platform-specific updater capability', () => {
  it('enables updates for Windows x64 only', () => {
    expect(supportsWindowsX64Updater('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(true);
    expect(supportsWindowsX64Updater('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows', 'x86')).toBe(true);
  });

  it('does not advertise the Windows updater on Linux or macOS', () => {
    expect(supportsWindowsX64Updater('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
    expect(supportsWindowsX64Updater('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe(false);
  });

  it('rejects Windows ARM even when a compatibility user agent claims x64', () => {
    expect(supportsWindowsX64Updater('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows', 'arm')).toBe(false);
    expect(supportsWindowsX64Updater('Mozilla/5.0 (Windows NT 10.0; ARM64)')).toBe(false);
  });
});
