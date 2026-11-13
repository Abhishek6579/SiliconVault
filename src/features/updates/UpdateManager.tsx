import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { isDesktopApp, platform } from '../../platform';

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
  const [releaseNotes, setReleaseNotes] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const busyRef = useRef(false);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!isDesktopApp()) return;
    if (manual) { setVisible(true); setMessage('Checking for updates…'); }
    if (busyRef.current) return;
    busyRef.current = true;
    setChecking(true);
    try {
      const result = await platform.checkForUpdate();
      setUpdate(result);
      if (result) setVisible(true);
      setMessage(result ? '' : manual ? 'SiliconVault is up to date.' : '');
    } catch (error) {
      if (manual) { setVisible(true); setMessage(error instanceof Error ? error.message : String(error)); }
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let disposed = false;
    let unlistenProgress: (() => void) | undefined;
    let unlistenReleaseNotes: (() => void) | undefined;

    void platform.listen<UpdateProgress>('siliconvault-update-progress', (payload) => {
      if (!disposed) setProgress(payload);
    }).then((stop) => {
      if (disposed) stop();
      else unlistenProgress = stop;
    }).catch(() => undefined);

    void platform.listen<UpdateInfo>('siliconvault-release-notes', (payload) => {
      if (!disposed) setReleaseNotes(payload);
    }).then((stop) => {
      if (disposed) stop();
      else unlistenReleaseNotes = stop;
    }).catch(() => undefined);

    const initialCheck = window.setTimeout(() => { void checkForUpdates(false); }, 5000);
    const interval = window.setInterval(() => { void checkForUpdates(false); }, 6 * 60 * 60 * 1000);
    return () => {
      disposed = true;
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      unlistenProgress?.();
      unlistenReleaseNotes?.();
    };
  }, [checkForUpdates]);

  const install = async () => {
    busyRef.current = true;
    setInstalling(true);
    setProgress({ downloaded: 0, contentLength: null, finished: false });
    setMessage('Preparing update…');
    try {
      await platform.installUpdate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      busyRef.current = false;
      setInstalling(false);
      setProgress(null);
    }
  };

  if (!isDesktopApp() || (!visible && !installing && !releaseNotes)) return null;
  const percent = progress?.contentLength
    ? Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100))
    : null;

  return (
    <>
      {releaseNotes && (
        <div role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReleaseNotes(null);
        }} style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(5px)' }}>
          <section role="dialog" aria-modal="true" aria-labelledby="release-notes-title" style={{ width: 'min(620px, 100%)', maxHeight: 'min( min(720px, 85vh), 900px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border, #3a3a3a)', borderRadius: 16, background: 'var(--panel, #202020)', color: 'var(--text, #f5f5f5)', boxShadow: '0 24px 80px #0009' }}>
            <header style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border, #3a3a3a)' }}>
              <div style={{ color: 'var(--muted, #aaa)', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Update installed</div>
              <h2 id="release-notes-title" style={{ margin: '7px 0 0', fontSize: 22, fontWeight: 650 }}>What’s new in SiliconVault {releaseNotes.version}</h2>
            </header>
            <div style={{ padding: '18px 24px', overflowY: 'auto', lineHeight: 1.65, fontSize: 13 }}>
              {releaseNotes.notes?.trim() ? (
                <ReactMarkdown>{releaseNotes.notes}</ReactMarkdown>
              ) : (
                <p style={{ color: 'var(--muted, #aaa)' }}>This release does not include published release notes.</p>
              )}
            </div>
            <footer style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border, #3a3a3a)' }}>
              <button className="primary-button" onClick={() => setReleaseNotes(null)}>Continue to SiliconVault</button>
            </footer>
          </section>
        </div>
      )}
      {(visible || installing) && (
        <aside style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 10000, width: 'min(390px, calc(100vw - 36px))', padding: 16, border: '1px solid var(--border, #3a3a3a)', borderRadius: 12, background: 'var(--panel, #202020)', color: 'var(--text, #f5f5f5)', boxShadow: '0 12px 40px #0007', fontSize: 13 }}>
          <button className="icon-button" aria-label="Dismiss update notification" title="Dismiss" disabled={installing} onClick={() => { setVisible(false); setUpdate(null); }} style={{ position: 'absolute', top: 7, right: 7 }}>×</button>
          {update ? <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <strong>SiliconVault {update.version} is available</strong>
            </div>
            {update.notes && <div style={{ margin: '9px 0', maxHeight: 120, overflow: 'auto', color: 'var(--muted, #b5b5b5)' }}><ReactMarkdown>{update.notes}</ReactMarkdown></div>}
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
      )}
    </>
  );
}
