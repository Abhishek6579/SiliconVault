/** Stable, locale-independent comparison key used for cross-platform duplicate detection. */
export function duplicateKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Validate the filename rules shared by Windows, macOS, and Linux. */
export function validateFileName(name: string, currentName?: string): void {
  if (!name || name !== name.trim() || name === '.' || name === '..') {
    throw new Error('Enter a valid file name without leading or trailing whitespace.');
  }
  if (name.length > 255) throw new Error('File names cannot exceed 255 characters.');
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) {
    throw new Error('The file name contains characters or trailing punctuation that Windows does not support.');
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    throw new Error('This file name is reserved by Windows.');
  }
  if (currentName !== undefined && fileExtension(name) !== fileExtension(currentName)) {
    throw new Error('Changing a file extension does not convert its contents. Keep the existing extension; format conversion is not supported.');
  }
}
