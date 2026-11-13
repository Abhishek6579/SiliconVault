import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktopApp } from '../../platform/desktop';

interface UpdateInfo {
  version: string;
  notes?: string | null;
}

interface UpdateProgress {
  downloaded: number;
  contentLength?: number | null;
  finished: boolean;
}

export default function UpdateManager() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const busyRef = useRef(false);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!isDesktopApp() || busyRef.current) return;
    busyRef.current = true;
    setChecking(true);
    if (manual) {
      setVisible(true);
      setMessage('Checking for updates…');
    }
    try {
      const result = await invoke<UpdateInfo | null>('check_for_update');
      setUpdate(result);
      if (result) setVisible(true);
      setMessage(result ? '' : manual ? 'SiliconVault is up to date.' : '');
    } catch (error) {
      if (manual) {
        setVisible(true);
        setMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<UpdateProgress>('siliconvault-update-progress', (event) => {
      if (!disposed) setProgress(event.payload);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => undefined);

    const initialCheck = window.setTimeout(() => { void checkForUpdates(false); }, 5000);
    const interval = window.setInterval(() => { void checkForUpdates(false); }, 6 * 60 * 60 * 1000);
    return () => {
      disposed = true;
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      unlisten?.();
    };
  }, [checkForUpdates]);

  const install = async () => {
    busyRef.current = true;
    setInstalling(true);
    setProgress({ downloaded: 0, contentLength: null, finished: false });
    setMessage('Preparing update…');
    try {
      await invoke('install_update');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      busyRef.current = false;
      setInstalling(false);
      setProgress(null);
    }
  };

  if (!isDesktopApp() || (!visible && !installing)) return null;
  const percent = progress?.contentLength
    ? Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100))
    : null;

  return (
    <aside style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 10000, width: 'min(390px, calc(100vw - 36px))', padding: 16, border: '1px solid var(--border, #3a3a3a)', borderRadius: 12, background: 'var(--panel, #202020)', color: 'var(--text, #f5f5f5)', boxShadow: '0 12px 40px #0007', fontSize: 13 }}>
      <button className="icon-button" aria-label="Dismiss update notification" title="Dismiss" disabled={installing} onClick={() => setVisible(false)} style={{ position: 'absolute', top: 7, right: 7 }}>×</button>
      {update ? <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong>SiliconVault {update.version} is available</strong>
          <button className="icon-button" aria-label="Dismiss update" disabled={installing} onClick={() => { setUpdate(null); setVisible(false); }}>×</button>
        </div>
        {update.notes && <p style={{ margin: '9px 0', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', color: 'var(--muted, #b5b5b5)' }}>{update.notes}</p>}
        {installing ? <>
          <div style={{ margin: '10px 0 6px' }}>{percent === null ? 'Downloading and verifying update…' : `Downloading update… ${percent}%`}</div>
          <div style={{ height: 5, borderRadius: 8, background: '#555', overflow: 'hidden' }}><div style={{ height: '100%', width: `${percent ?? 8}%`, background: 'var(--accent, #7c9cff)', transition: 'width 150ms' }} /></div>
        </> : <button className="primary-button" style={{ marginTop: 8 }} onClick={() => void install()}>Download and install</button>}
      </> : <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{message || 'Keep SiliconVault up to date'}</span>
          <button className="text-button" disabled={checking || installing} onClick={() => void checkForUpdates(true)}>{checking ? 'Checking…' : 'Check for updates'}</button>
        </div>
      </>}
    </aside>
  );
}
