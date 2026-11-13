import { Download, HardDrive } from 'lucide-react';

interface MigrationDialogProps {
  error: string;
  upgrading: boolean;
  desktopApp: boolean;
  onUpgrade: () => void;
}

export default function MigrationDialog({ error, upgrading, desktopApp, onUpgrade }: MigrationDialogProps) {
  return <div className="modal-backdrop upgrade-backdrop">
    <section className="move-dialog upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <div className="upgrade-mark"><HardDrive size={21} /></div>
      <div className="modal-eyebrow">SAFE WORKSPACE UPDATE</div>
      <h2 id="upgrade-title">Back up before we continue</h2>
      <p className="move-dialog-copy">This update adds separate workspaces and keeps your theme and PDF reading positions. Before the database changes, a full backup of your files, folders, projects, and settings will download.</p>
      {error && <div className="inline-error">The update did not finish: {error}. Your old database is left in place; you can retry after saving the downloaded backup.</div>}
      <button className="primary-button upgrade-button" disabled={upgrading} onClick={onUpgrade}>{upgrading ? <><span className="spinner" /> Updating…</> : <><Download size={15} /> {desktopApp ? 'Download backup & continue' : 'Download backup (desktop required)'}</>}</button>
    </section>
  </div>;
}
