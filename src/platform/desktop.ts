import { trackedInvoke, trackOperation } from '../activityLog';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, stat, writeFile } from '@tauri-apps/plugin-fs';
import { assertBackupFileSize, assertImportFileSize } from '../storage/limits';
import type { PlatformAdapter } from './types';
import { supportsWindowsX64Updater } from './target';

const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string; architecture?: string } }).userAgentData;
const updatesSupported = supportsWindowsX64Updater(navigator.userAgent, userAgentData?.platform, userAgentData?.architecture);

function iterateDesktopFiles(): AsyncGenerator<File> {
  let total: number | null = null;
  const iterator = (async function* () {
    const paths = await open({ multiple: true, title: 'Import files' });
    if (!paths) return;
    const selected = Array.isArray(paths) ? paths : [paths];
    total = selected.length;
    // Read and yield one selected file at a time to keep peak memory bounded.
    for (const path of selected) {
      const name = path.split(/[\\\\/]/).pop() || 'Imported file';
      const info = await stat(path);
      assertImportFileSize(name, info.size, mimeType(name));
      const bytes = await readFile(path);
      yield new File([bytes], name, { type: mimeType(name) });
    }
  })();
  Object.defineProperty(iterator, 'length', { get: () => total });
  return iterator;
}

function iterateDesktopFolder(): AsyncGenerator<File> {
  let total: number | null = null;
  const iterator = (async function* () {
    const root = await open({ directory: true, recursive: true, title: 'Import folder' });
    if (!root) return;
    const selected: Array<{ path: string; name: string; relativePath: string }> = [];
    async function collect(directory: string, relative = ''): Promise<void> {
      for (const entry of await readDir(directory)) {
        if (entry.isSymlink) continue;
        const path = `${directory.replace(/[\\\\/]$/, '')}/${entry.name}`;
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory) await collect(path, childRelative);
        else if (entry.isFile) selected.push({ path, name: entry.name, relativePath: childRelative });
      }
    }
    await collect(root);
    total = selected.length;
    // Directory enumeration is complete before reading file bytes, so the UI can show an exact count.
    for (const item of selected) {
      const info = await stat(item.path);
      assertImportFileSize(item.name, info.size, mimeType(item.name));
      const bytes = await readFile(item.path);
      const file = new File([bytes], item.name, { type: mimeType(item.name) });
      Object.defineProperty(file, 'webkitRelativePath', { value: item.relativePath });
      yield file;
    }
  })();
  Object.defineProperty(iterator, 'length', { get: () => total });
  return iterator;
}


async function chooseBackupToRestore(): Promise<File | null> {
  const path = await open({ multiple: false, title: 'Restore workspace backup', filters: [{ name: 'SiliconVault backup', extensions: ['json'] }] });
  if (!path || Array.isArray(path)) return null;
  const info = await stat(path);
  assertBackupFileSize(info.size);
  const bytes = await readFile(path);
  return new File([bytes], path.split(/[\\\\/]/).pop() || 'backup.json', { type: 'application/json' });
}

async function saveBackupToDesktop(content: string | ReadableStream<Uint8Array>): Promise<boolean> {
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


async function saveDiagnosticsExport(content: string): Promise<boolean> {
  const path = await save({
    title: 'Export SiliconVault diagnostics',
    defaultPath: `silicon-vault-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Diagnostics report', extensions: ['json'] }],
  });
  if (!path) return false;
  await writeFile(path, new TextEncoder().encode(content));
  return true;
}

export const desktopPlatform: PlatformAdapter = {
  capabilities: { nativeBackupSave: true, nativeBackupOpen: true, systemDiagnostics: true, systemStats: true, officeConversion: true, updates: updatesSupported, safeShutdown: true },
  log: (level, event, message) => trackedInvoke('log_frontend_event', { level, event, message }),
  getSystemStats: () => trackedInvoke('get_system_stats'),
  getDiagnostics: () => trackedInvoke('get_diagnostics'),
  exportDiagnostics: () => trackedInvoke('export_diagnostics'),
  convertOfficeToPdf: async (bytes, extension) => new Uint8Array(await trackedInvoke<number[]>('convert_office_to_pdf', { bytes: Array.from(bytes), extension })),
  checkForUpdate: () => trackedInvoke('check_for_update'),
  installUpdate: () => trackedInvoke('install_update'),
  listen: async (event, handler) => listen(event, (payload) => handler(payload.payload as never)),
  onCloseRequested: async (handler) => getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    await handler(() => getCurrentWindow().destroy());
  }),
  saveBackup: (content) => trackOperation('backup.export', 'native-save-dialog', () => saveBackupToDesktop(content)),
  saveDiagnostics: (content) => trackOperation('diagnostics.export', 'native-save-dialog', () => saveDiagnosticsExport(content)),
  chooseBackup: () => trackOperation('backup.restore.choose', 'native-open-dialog', chooseBackupToRestore),
  chooseFiles: iterateDesktopFiles,
  chooseFolderFiles: iterateDesktopFolder,
  getRelativePath: (file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
};
