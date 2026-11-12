import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, AlertTriangle, Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { isDesktopApp, saveDiagnosticsExport } from '../../../platform/desktop';
import { logger } from '../../../logger.js';

interface DiagnosticsSnapshot {
  schemaVersion: number; appVersion: string; platform: string; architecture: string;
  uptimeSeconds: number; collectedAt: string;
  system: { cpu: number | null; ram: number | null; gpu: number | null };
  logs: { appLogBytes: number; crashLogBytes: number; startupReportBytes: number; diagnosticsDirectory: string };
  dataIsolation: string;
}
const formatBytes = (bytes: number) => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(2) + ' MB';
const formatUptime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? hours + 'h ' + minutes + 'm' : minutes + 'm ' + (seconds % 60) + 's';
};

export default function DiagnosticsDashboard() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    if (!isDesktopApp()) { setError('System diagnostics are available in the desktop application.'); setLoading(false); return; }
    setLoading(true);
    try { setSnapshot(await invoke<DiagnosticsSnapshot>('get_diagnostics')); setError(''); }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message); void logger.error('diagnostics.refresh_failed', message);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const exportReport = async () => {
    setExporting(true);
    try {
      const report = await invoke<string>('export_diagnostics');
      await saveDiagnosticsExport(report);
      void logger.info('diagnostics.exported', 'Diagnostic report export requested');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message); void logger.error('diagnostics.export_failed', message);
    } finally { setExporting(false); }
  };

  return <section className="diagnostics-dashboard">
    <header className="diagnostics-heading">
      <div><span className="diagnostics-eyebrow">SYSTEM HEALTH</span><h1>Diagnostics</h1><p>Application health, operational logs and recovery metadata.</p></div>
      <div className="diagnostics-actions">
        <button className="outline-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        <button className="primary-button" onClick={() => void exportReport()} disabled={exporting || !snapshot}><Download size={15} /> {exporting ? 'Preparing…' : 'Export report'}</button>
      </div>
    </header>
    {error && <div className="diagnostics-error"><AlertTriangle size={16} />{error}</div>}
    {loading && !snapshot ? <div className="loading-state">Collecting system diagnostics…</div> : snapshot && <>
      <div className="diagnostics-card-grid">
        <article className="diagnostics-card"><span>CPU utilisation</span><strong>{snapshot.system.cpu == null ? 'Unavailable' : Math.round(snapshot.system.cpu) + '%'}</strong><small>Host processor</small></article>
        <article className="diagnostics-card"><span>Memory utilisation</span><strong>{snapshot.system.ram == null ? 'Unavailable' : Math.round(snapshot.system.ram) + '%'}</strong><small>Physical memory</small></article>
        <article className="diagnostics-card"><span>GPU utilisation</span><strong>{snapshot.system.gpu == null ? 'Unavailable' : Math.round(snapshot.system.gpu) + '%'}</strong><small>GPU engine counters</small></article>
        <article className="diagnostics-card"><span>Session uptime</span><strong>{formatUptime(snapshot.uptimeSeconds)}</strong><small>Current process</small></article>
      </div>
      <div className="diagnostics-section">
        <div className="diagnostics-section-title"><Activity size={17} /><h2>Application</h2></div>
        <dl className="diagnostics-details">
          <div><dt>Version</dt><dd>{snapshot.appVersion}</dd></div>
          <div><dt>Platform</dt><dd>{snapshot.platform} · {snapshot.architecture}</dd></div>
          <div><dt>Collected</dt><dd>{new Date(Number(snapshot.collectedAt) * 1000).toLocaleString()}</dd></div>
          <div><dt>Schema</dt><dd>Diagnostics v{snapshot.schemaVersion}</dd></div>
        </dl>
      </div>
      <div className="diagnostics-section">
        <div className="diagnostics-section-title"><FileText size={17} /><h2>Diagnostic files</h2></div>
        <div className="diagnostics-log-list">
          <div><span><b>app.log</b><small>Lifecycle and operational events</small></span><strong>{formatBytes(snapshot.logs.appLogBytes)}</strong></div>
          <div><span><b>crash.log</b><small>Rust panic records</small></span><strong>{formatBytes(snapshot.logs.crashLogBytes)}</strong></div>
          <div><span><b>startup.json</b><small>Startup and previous-session metadata</small></span><strong>{formatBytes(snapshot.logs.startupReportBytes)}</strong></div>
        </div>
        <p className="diagnostics-path">{snapshot.logs.diagnosticsDirectory}</p>
      </div>
      <div className="diagnostics-privacy"><ShieldCheck size={18} /><div><b>Workspace data is isolated</b><p>{snapshot.dataIsolation} Diagnostic exports contain bounded log excerpts and system metadata, not document content or database records.</p></div></div>
    </>}
  </section>;
}
