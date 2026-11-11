import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, writeFile } from '@tauri-apps/plugin-fs';

export function isDesktopApp(): boolean {
  return isTauri();
}

export async function pickDesktopFiles(): Promise<File[]> {
  const paths = await open({ multiple: true, title: 'Import files' });
  if (!paths) return [];
  const selected = Array.isArray(paths) ? paths : [paths];
  return Promise.all(selected.map(async (path) => {
    const bytes = await readFile(path);
    const name = path.split(/[\\/]/).pop() || 'Imported file';
    return new File([bytes], name, { type: mimeType(name) });
  }));
}

export async function pickDesktopFolder(): Promise<File[]> {
  const root = await open({ directory: true, recursive: true, title: 'Import folder' });
  if (!root) return [];
  const files: File[] = [];
  async function visit(directory: string, relative = ''): Promise<void> {
    for (const entry of await readDir(directory)) {
      if (entry.isSymlink) continue;
      const path = `${directory.replace(/[\\/]$/, '')}/${entry.name}`;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory) await visit(path, childRelative);
      else if (entry.isFile) {
        const bytes = await readFile(path);
        const file = new File([bytes], entry.name, { type: mimeType(entry.name) });
        Object.defineProperty(file, 'webkitRelativePath', { value: childRelative });
        files.push(file);
      }
    }
  }
  await visit(root);
  return files;
}

export async function chooseBackupToRestore(): Promise<File | null> {
  const path = await open({ multiple: false, title: 'Restore workspace backup', filters: [{ name: 'SiliconVault backup', extensions: ['json'] }] });
  if (!path || Array.isArray(path)) return null;
  const bytes = await readFile(path);
  return new File([bytes], path.split(/[\\/]/).pop() || 'backup.json', { type: 'application/json' });
}

export async function saveBackupToDesktop(content: string): Promise<void> {
  const path = await save({ title: 'Save workspace backup', defaultPath: `silicon-vault-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'SiliconVault backup', extensions: ['json'] }] });
  if (path) await writeFile(path, new TextEncoder().encode(content));
}

function mimeType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'md' || extension === 'markdown') return 'text/markdown';
  if (['sv', 'v', 'vhd', 'vhdl', 'c', 'h', 'cpp', 'py', 'js', 'ts', 'json', 'sh', 's', 'asm', 'txt'].includes(extension ?? '')) return 'text/plain';
  return 'application/octet-stream';
}
