import type { FormEvent, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

export interface WorkspaceDialogState {
  mode: 'input' | 'confirm';
  title: string;
  message?: string;
  value?: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (value: string) => void | Promise<void>;
}

interface WorkspaceDialogProps {
  dialog: WorkspaceDialogState | null;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (value: string) => void;
}

export default function WorkspaceDialog({ dialog, onClose, onSubmit, onChange }: WorkspaceDialogProps) {
  if (!dialog) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onClose();
  };

  return (
    <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="app-dialog" role="dialog" aria-modal="true" onSubmit={handleSubmit}>
        <div className="move-dialog-header">
          <div><div className="modal-eyebrow">WORKSPACE</div><h2>{dialog.title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        {dialog.message && <p className="move-dialog-copy">{dialog.message}</p>}
        {dialog.mode === 'input' && (
          <input
            className="dialog-input"
            autoFocus
            value={dialog.value ?? ''}
            placeholder={dialog.placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        <div className="move-dialog-footer">
          <button type="button" className="text-button" onClick={onClose}>Cancel</button>
          <button type="submit" className={dialog.destructive ? 'danger-button' : 'primary-button'} disabled={dialog.mode === 'input' && !dialog.value?.trim()}>{dialog.confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
