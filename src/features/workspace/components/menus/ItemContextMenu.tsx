import { ExternalLink, FolderPlus, Import, MoveRight, Pencil, Trash2 } from 'lucide-react';

type ContextItemType = 'file' | 'folder' | 'project';
type ContextAction = 'open' | 'rename' | 'move' | 'import' | 'import-folder' | 'delete';

interface ItemContextMenuProps {
  type: ContextItemType;
  name: string;
  onAction: (action: ContextAction) => void;
}

export default function ItemContextMenu({ type, name, onAction }: ItemContextMenuProps) {
  return <>
    <div className="context-menu-title">{name}</div>
    <button onClick={() => onAction('open')}><ExternalLink size={15} /><span>{type === 'file' ? 'Open' : type === 'folder' ? 'Open folder' : 'Switch to workspace'}</span></button>
    <button onClick={() => onAction('rename')}><Pencil size={15} /><span>Rename</span></button>
    {type !== 'project' && <button onClick={() => onAction('move')}><MoveRight size={15} /><span>Move to…</span></button>}
    {type !== 'file' && <button onClick={() => onAction('import')}><Import size={15} /><span>Import files here…</span></button>}
    {type !== 'file' && <button onClick={() => onAction('import-folder')}><FolderPlus size={15} /><span>Import folder here…</span></button>}
    <div className="context-separator" />
    <button className="context-danger" onClick={() => onAction('delete')}><Trash2 size={15} /><span>{type === 'file' ? 'Move to Trash' : type === 'folder' ? 'Delete folder' : 'Delete project'}</span></button>
  </>;
}
