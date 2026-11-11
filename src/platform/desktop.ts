import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, stat, writeFile } from '@tauri-apps/plugin-fs';
import { assertBackupFileSize, assertImportFileSize } from '../storage/limits';

export function isDesktopApp(): boolean {
  return isTauri();
}

export async function* iterateDesktopFiles(): AsyncGenerator<File> {
  const paths = await open({ multiple: true, title: 'Import files' });
  if (!paths) return;
  const selected = Array.isArray(paths) ? paths : [paths];
  // Read and yield one selected file at a time; the caller persists it before
  // the next file is read, avoiding a Promise.all-sized memory spike.
  for (const path of selected) {
    const name = path.split(/[\\\\/]/).pop() || 'Imported file';
    const info = await stat(path);
    assertImportFileSize(name, info.size);
    const bytes = await readFile(path);
    yield new File([bytes], name, { type: mimeType(name) });
  }
}

export async function* iterateDesktopFolder(): AsyncGenerator<File> {
  const root = await open({ directory: true, recursive: true, title: 'Import folder' });
  if (!root) return;
  async function* visit(directory: string, relative = ''): AsyncGenerator<File> {
    for (const entry of await readDir(directory)) {
      if (entry.isSymlink) continue;
      const path = `${directory.replace(/[\\\\/]$/, '')}/${entry.name}`;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        yield* visit(path, childRelative);
      } else if (entry.isFile) {
        const info = await stat(path);
        assertImportFileSize(entry.name, info.size);
        const bytes = await readFile(path);
        const file = new File([bytes], entry.name, { type: mimeType(entry.name) });
        Object.defineProperty(file, 'webkitRelativePath', { value: childRelative });
        yield file;
      }
    }
  }
  yield* visit(root);
}


export async function chooseBackupToRestore(): Promise<File | null> {
  const path = await open({ multiple: false, title: 'Restore workspace backup', filters: [{ name: 'SiliconVault backup', extensions: ['json'] }] });
  if (!path || Array.isArray(path)) return null;
  const info = await stat(path);
  assertBackupFileSize(info.size);
  const bytes = await readFile(path);
  return new File([bytes], path.split(/[\\\\/]/).pop() || 'backup.json', { type: 'application/json' });
}

export async function saveBackupToDesktop(content: string | ReadableStream<Uint8Array>): Promise<boolean> {
  const path = await save({ title: 'Save workspace backup', defaultPath: `silicon-vault-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'SiliconVault backup', extensions: ['json'] }] });
  if (!path) return false;
  await writeFile(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  return true;
}

function mimeType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'md' || extension === 'markdown') return 'text/markdown';
  if (['sv', 'v', 'vhd', 'vhdl', 'c', 'h', 'cpp', 'py', 'js', 'ts', 'json', 'sh', 's', 'asm', 'txt'].includes(extension ?? '')) return 'text/plain';
  return 'application/octet-stream';
}
