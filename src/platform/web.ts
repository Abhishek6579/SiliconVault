import type { PlatformAdapter } from './types';

function chooseFiles(): AsyncGenerator<File> {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  return yieldFiles(selectFiles(input));
}

function chooseFolderFiles(): AsyncGenerator<File> {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  input.setAttribute('directory', '');
  return yieldFiles(selectFiles(input));
}

async function* yieldFiles(selected: Promise<File[]>): AsyncGenerator<File> {
  for (const file of await selected) yield file;
}

function selectFiles(input: HTMLInputElement): Promise<File[]> {
  return new Promise((resolve) => {
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

function download(content: string, filename: string, type: string): boolean {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  return true;
}

export const webPlatform: PlatformAdapter = {
  kind: 'web',
  async log() {},
  async getSystemStats() { throw new Error('System statistics are available in the desktop application.'); },
  async getDiagnostics() { throw new Error('System diagnostics are available in the desktop application.'); },
  async exportDiagnostics() { throw new Error('System diagnostics are available in the desktop application.'); },
  async convertOfficeToPdf() { throw new Error('Office conversion is available in the desktop application.'); },
  async checkForUpdate() { return null; },
  async installUpdate() { throw new Error('Application updates are available in the desktop application.'); },
  async listen() { return () => undefined; },
  async onCloseRequested() { return () => undefined; },
  async saveBackup(content) {
    const serialized = typeof content === 'string' ? content : await new Response(content).text();
    return download(serialized, `silicon-vault-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  },
  async saveDiagnostics(content) {
    return download(content, `silicon-vault-diagnostics-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  },
  async chooseBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    const files = await selectFiles(input);
    return files[0] ?? null;
  },
  chooseFiles,
  chooseFolderFiles,
};
