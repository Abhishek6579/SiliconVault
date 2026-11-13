import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { Activity, Clock3, Command, Download, HardDrive, Import, LayoutGrid, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from 'lucide-react';
import { formatSize } from '../../../../utils/format';

type View = 'workspace' | 'recent' | 'trash';

interface SidebarData {
  collapsed: boolean;
  view: View;
  activeProjectId: string | null;
  liveFileCount: number;
  trashCount: number;
  cpu: number | null;
  ram: number | null;
  gpu: number | null;
  storedBytes: number;
}

interface SidebarActions {
  onToggleCollapsed: () => void;
  onNavigate: (view: View) => void;
  onCreateProject: () => void;
  onSaveBackup: () => void;
  onRestoreBackup: (input: HTMLInputElement | null) => void;
  onBackupFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

interface SidebarProps {
  data: SidebarData;
  actions: SidebarActions;
  children: ReactNode;
}

export default function Sidebar({ data, actions, children }: SidebarProps) {
  const { collapsed, view, activeProjectId, liveFileCount, trashCount, cpu, ram, gpu, storedBytes } = data;
  const backupInput = useRef<HTMLInputElement>(null);
  const navigate = (nextView: View) => actions.onNavigate(nextView);
  const stats = [{ label: 'CPU', value: cpu }, { label: 'RAM', value: ram }, { label: 'GPU', value: gpu }];
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="brand-row">
      <div className="brand-mark"><Command size={19} strokeWidth={2.2} /></div>
      {!collapsed && <div className="brand-copy"><b>Workbench</b><span>Engineering workspace</span></div>}
      <button className="icon-button sidebar-toggle" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={actions.onToggleCollapsed}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
    </div>
    {!collapsed ? <>
      <div className="sidebar-primary">
        <button className={`nav-item ${view === 'workspace' && activeProjectId === null ? 'active' : ''}`} onClick={() => navigate('workspace')}><LayoutGrid size={16} /> Workspace</button>
        <button className={`nav-item ${view === 'recent' ? 'active' : ''}`} onClick={() => navigate('recent')}><Clock3 size={16} /> Recent <span className="nav-count">{liveFileCount}</span></button>
        <button className={`nav-item ${view === 'trash' ? 'active' : ''}`} onClick={() => navigate('trash')}><Trash2 size={16} /> Trash {trashCount > 0 && <span className="nav-count">{trashCount}</span>}</button>
      </div>
      <div className="sidebar-section-heading"><span>PROJECTS</span><button title="New project" onClick={actions.onCreateProject}><Plus size={15} /></button></div>
      <div className="project-tree">{children}</div>
      <div className="sidebar-bottom">
        <div className="system-monitor" aria-label="System utilisation">
          <div className="system-monitor-heading"><Activity size={13} /><span>System</span><span className="system-monitor-live">LIVE</span></div>
          {stats.map(({ label, value }) => <div className="system-metric" key={label} title={value == null ? `${label} utilisation unavailable` : `${label} utilisation ${Math.round(value)}%`}>
            <span className="system-metric-label">{label}</span><div className="system-metric-track" role="meter" aria-label={`${label} utilisation`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}><i style={{ width: `${value == null ? 0 : Math.min(100, Math.max(0, value))}%` }} /></div><span className="system-metric-value">{value == null ? '—' : `${Math.round(value)}%`}</span>
          </div>)}
          <div className="system-storage"><div className="storage-line"><HardDrive size={14} /><span>Stored on this device</span></div><div className="storage-meter"><i style={{ width: `${Math.min(100, storedBytes / (250 * 1024 * 1024) * 100)}%` }} /></div><span className="storage-caption">{formatSize(storedBytes)} used</span></div>
        </div>
        <div className="sidebar-actions"><button onClick={actions.onSaveBackup} title="Save a workspace backup"><Download size={15} /> Backup</button><button onClick={() => actions.onRestoreBackup(backupInput.current)} title="Restore from backup"><Import size={15} /> Restore</button></div>
        <input ref={backupInput} className="hidden" type="file" accept="application/json,.json" onChange={actions.onBackupFileChange} />
      </div>
    </> : <div className="collapsed-nav">
      <button title="Workspace" onClick={() => navigate('workspace')}><LayoutGrid size={18} /></button><button title="Recent" onClick={() => navigate('recent')}><Clock3 size={18} /></button><button title="Trash" onClick={() => navigate('trash')}><Trash2 size={18} /></button><button title="New project" onClick={actions.onCreateProject}><Plus size={18} /></button>
    </div>}
  </aside>;
}
