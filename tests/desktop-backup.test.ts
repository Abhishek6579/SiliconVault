import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BACKUP_FILE_SIZE_BYTES } from '../src/storage/limits';

const tauri = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readDir: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
  getCurrentWindow: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: tauri.open, save: tauri.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: tauri.readDir,
  readFile: tauri.readFile,
  stat: tauri.stat,
  writeFile: tauri.writeFile,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: tauri.getCurrentWindow }));

let desktopPlatform: typeof import('../src/platform/desktop').desktopPlatform;

beforeAll(async () => {
  // desktop.ts reads navigator while detecting updater support at module initialization.
  vi.stubGlobal('navigator', { userAgent: 'SiliconVault desktop test' });
  ({ desktopPlatform } = await import('../src/platform/desktop'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('native desktop backup dialogs', () => {
  it('opens the restore picker, checks the selected file size, and reads the file', async () => {
    const selectedPath = 'C:\\Backups\\workspace.json';
    tauri.open.mockResolvedValueOnce(selectedPath);
    tauri.stat.mockResolvedValueOnce({ size: 3 });
    tauri.readFile.mockResolvedValueOnce(new Uint8Array([123, 125, 10]));

    const selected = await desktopPlatform.chooseBackup();

    expect(tauri.open).toHaveBeenCalledWith(expect.objectContaining({
      multiple: false,
      title: 'Restore workspace backup',
      filters: [{ name: 'SiliconVault backup', extensions: ['json'] }],
    }));
    expect(tauri.stat).toHaveBeenCalledWith(selectedPath);
    expect(tauri.readFile).toHaveBeenCalledWith(selectedPath);
    expect(selected).toBeInstanceOf(File);
    expect(selected?.name).toBe('workspace.json');
    expect(selected?.type).toBe('application/json');
    expect(await selected!.text()).toBe('{}\n');
  });

  it('rejects an oversized native backup before allocating or reading its contents', async () => {
    const selectedPath = 'C:\\Backups\\oversized.json';
    tauri.open.mockResolvedValueOnce(selectedPath);
    tauri.stat.mockResolvedValueOnce({ size: MAX_BACKUP_FILE_SIZE_BYTES + 1 });

    await expect(desktopPlatform.chooseBackup()).rejects.toThrow(/maximum backup size is 160 MiB/);
    expect(tauri.stat).toHaveBeenCalledWith(selectedPath);
    expect(tauri.readFile).not.toHaveBeenCalled();
  });

  it('treats restore-picker cancellation as a no-op', async () => {
    tauri.open.mockResolvedValueOnce(null);

    await expect(desktopPlatform.chooseBackup()).resolves.toBeNull();
    expect(tauri.stat).not.toHaveBeenCalled();
    expect(tauri.readFile).not.toHaveBeenCalled();
  });

  it('writes the selected backup destination using the native filesystem adapter', async () => {
    const selectedPath = 'C:\\Backups\\workspace.json';
    tauri.save.mockResolvedValueOnce(selectedPath);
    tauri.writeFile.mockResolvedValueOnce(undefined);

    await expect(desktopPlatform.saveBackup('backup payload')).resolves.toBe(true);

    expect(tauri.save).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Save workspace backup',
      filters: [{ name: 'SiliconVault backup', extensions: ['json'] }],
    }));
    expect(tauri.writeFile).toHaveBeenCalledWith(selectedPath, new TextEncoder().encode('backup payload'));
  });

  it('does not write a backup when the save dialog is cancelled', async () => {
    tauri.save.mockResolvedValueOnce(null);

    await expect(desktopPlatform.saveBackup('backup payload')).resolves.toBe(false);
    expect(tauri.writeFile).not.toHaveBeenCalled();
  });

  it('propagates native filesystem errors such as insufficient disk space', async () => {
    tauri.save.mockResolvedValueOnce('C:\\Backups\\workspace.json');
    tauri.writeFile.mockRejectedValueOnce(new DOMException('Not enough disk space', 'QuotaExceededError'));

    await expect(desktopPlatform.saveBackup('backup payload')).rejects.toThrow('Not enough disk space');
  });
});
