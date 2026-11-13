import { afterEach, describe, expect, it, vi } from 'vitest';
import { webPlatform } from '../src/platform/web';

afterEach(() => vi.unstubAllGlobals());

describe('web platform contract', () => {
  it('reports browser capabilities without claiming native operations', () => {
    expect(webPlatform.capabilities).toMatchObject({
      nativeBackupSave: false,
      nativeBackupOpen: false,
      systemDiagnostics: false,
      systemStats: false,
      officeConversion: false,
      updates: false,
      safeShutdown: false,
    });
  });

  it('picks nested folders synchronously and preserves their relative paths', async () => {
    const listeners = new Map<string, (event?: unknown) => void>();
    const file = new File(['source'], 'source.md');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Project/Notes/source.md' });
    const input = {
      files: [file],
      multiple: false,
      setAttribute: vi.fn(),
      addEventListener: (name: string, handler: (event?: unknown) => void) => listeners.set(name, handler),
      click: vi.fn(() => listeners.get('change')?.()),
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => input) });

    const selected = webPlatform.chooseFolderFiles();
    expect(input.click).toHaveBeenCalledOnce();
    expect(input.setAttribute).toHaveBeenCalledWith('webkitdirectory', '');
    expect((await selected.next()).value).toBe(file);
    expect(await selected.next()).toMatchObject({ done: true });
    expect(webPlatform.getRelativePath(file)).toBe('Project/Notes/source.md');
  });

  it('returns no update and reports unavailable system services explicitly', async () => {
    expect(await webPlatform.checkForUpdate()).toBeNull();
    await expect(webPlatform.getSystemStats()).rejects.toThrow(/desktop application/);
    await expect(webPlatform.installUpdate()).rejects.toThrow(/desktop application/);
  });
});
