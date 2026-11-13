import { Bookmark, Download, HardDrive } from 'lucide-react';
import { formatSize } from '../../../../utils/format';
import type { FileMeta, Folder, Project } from '../../../../storage/types';

interface Props {
  liveFiles: FileMeta[];
  activeProjects: Project[];
  folders: Folder[];
  activeWorkspaceId: string | null;
  onSaveBackup: () => void;
}
export default function DetailsPanel({ liveFiles, activeProjects, folders, activeWorkspaceId, onSaveBackup }: Props) {
  return <div className="details-content">
    <div className="details-card"><span className="details-icon"><HardDrive size={18} /></span><div><b>Stored on this device</b><span>Only you can access these files.</span></div></div>
    <div className="detail-row"><span>Total files</span><b>{liveFiles.length}</b></div>
    <div className="detail-row"><span>Projects</span><b>{activeProjects.length}</b></div>
    <div className="detail-row"><span>Folders</span><b>{folders.filter((folder) => folder.workspaceId === activeWorkspaceId).length}</b></div>
    <div className="detail-row"><span>Storage used</span><b>{formatSize(liveFiles.reduce((sum, item) => sum + item.size, 0))}</b></div>
    <div className="details-tip"><Bookmark size={15} /> Make regular backups to keep a copy of your workspace.</div>
    <button className="outline-button full-width" onClick={onSaveBackup}><Download size={15} /> Save backup</button>
  </div>;
}
