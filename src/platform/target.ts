/** The published updater manifest currently contains only the Windows x86_64 target. */
export function supportsWindowsX64Updater(
  userAgent: string,
  platformHint?: string,
  architectureHint?: string,
): boolean {
  const platform = platformHint || (/windows nt/i.test(userAgent) ? 'Windows' : '');
  if (!/windows/i.test(platform)) return false;

  if (architectureHint) {
    const architecture = architectureHint.toLowerCase();
    return architecture === 'x86' || architecture === 'x86_64' || architecture === 'x64';
  }

  return /(?:Win64|x64)/i.test(userAgent) && !/ARM64/i.test(userAgent);
}
