import type { Dispatch, SetStateAction } from 'react';
import FileKindIcon from '../../../components/FileKindIcon';
import { Maximize2, Minimize2, Pencil, Save, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { isEditableKind } from '../../../shared/constants/fileKinds';
import type { Folder } from '../../../storage/types';
import type { Tab } from '../types';

interface Props {
  activeTab: Tab;
  folders: Folder[];
  getProjectName: (id: string | null) => string | undefined;
  editorFontSize: number;
  focusMode: boolean;
  onFontSizeChange: Dispatch<SetStateAction<number>>;
  onTogglePreview: () => void;
  onSave: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleFocus: () => void;
}
export default function EditorTitlebar({ activeTab, folders, getProjectName, editorFontSize, focusMode, onFontSizeChange, onTogglePreview, onSave, onRename, onDelete, onToggleFocus }: Props) {
  const projectName = activeTab.meta.projectId ? getProjectName(activeTab.meta.projectId) : 'Workspace';
  const folderName = activeTab.meta.parentFolderId ? folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? '' : '';
  const location = `${projectName}${folderName ? ` / ${folderName}` : ''}`;
  return <div className="editor-titlebar">
    <div className="editor-file-title"><FileKindIcon kind={activeTab.meta.kind} size={16} /><b title={activeTab.meta.name}>{activeTab.meta.name}</b><span className="title-location" title={location}>{location}</span></div>
    <div className="editor-tools">
      {isEditableKind(activeTab.meta.kind) && <div className="editor-font-controls" title="Editor text size"><button className="icon-button" aria-label="Decrease editor text size" title="Decrease editor text size" onClick={() => onFontSizeChange((value) => Math.max(11, value - 1))}><ZoomOut size={14} /></button><span>{editorFontSize}px</span><button className="icon-button" aria-label="Increase editor text size" title="Increase editor text size" onClick={() => onFontSizeChange((value) => Math.min(24, value + 1))}><ZoomIn size={14} /></button></div>}
      {activeTab.meta.kind === 'markdown' && <button className={`text-button ${activeTab.preview ? 'selected' : ''}`} onClick={onTogglePreview}>{activeTab.preview ? 'Edit note' : 'Preview'}</button>}
      {isEditableKind(activeTab.meta.kind) && <button className="text-button" title="Save changes (Ctrl+S)" disabled={!activeTab.dirty} onClick={onSave}><Save size={14} /> Save</button>}
      <button className="icon-button" title="Rename" onClick={onRename}><Pencil size={15} /></button>
      <button className="icon-button" title="Move to trash" onClick={onDelete}><Trash2 size={15} /></button>
      <button className="icon-button" title={focusMode ? 'Exit focus view' : 'Maximize file'} onClick={onToggleFocus}>{focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
    </div>
  </div>;
}
