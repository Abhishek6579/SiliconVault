import { ChevronRight, Folder, Layers, X } from 'lucide-react';
import type { MoveDestination } from '../../selectors/destinations';

export interface MoveTarget {
  folderId: string | null;
  projectId: string | null;
  workspaceId: string;
}

interface MoveDialogProps {
  itemName: string;
  destinations: MoveDestination[];
  onClose: () => void;
  onMove: (target: MoveTarget) => void;
}

export default function MoveDialog({ itemName, destinations, onClose, onMove }: MoveDialogProps) {
  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-title">
      <div className="move-dialog-header"><div><div className="modal-eyebrow">MOVE ITEM</div><h2 id="move-title">Move “{itemName}”</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
      <p className="move-dialog-copy">Choose a workspace, project, or folder as the destination.</p>
      <div className="destination-list">
        {destinations.map((destination) => <button key={destination.key} className="destination-option" onClick={() => onMove({ folderId: destination.folderId, projectId: destination.projectId, workspaceId: destination.workspaceId })}>
          {destination.folderId ? <Folder size={16} /> : <Layers size={16} />}<span><b>{destination.label}</b><small>{destination.detail}</small></span><ChevronRight size={15} />
        </button>)}
        {destinations.length === 1 && <div className="destination-empty">Create a project or folder to add more destinations.</div>}
      </div>
      <div className="move-dialog-footer"><button className="text-button" onClick={onClose}>Cancel</button></div>
    </section>
  </div>;
}
