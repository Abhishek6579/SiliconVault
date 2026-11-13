import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import WorkspaceDialog, { type WorkspaceDialogState } from '../../../components/WorkspaceDialog';

type Prompt = (title: string, initialValue: string, placeholder: string, confirmLabel: string, onConfirm: (value: string) => void | Promise<void>, message?: string) => void;
type Confirm = (title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>, destructive?: boolean) => void;

interface DialogContextValue {
  dialog: WorkspaceDialogState | null;
  close: () => void;
  prompt: Prompt;
  confirm: Confirm;
  submit: (onError: (message: string) => void) => Promise<void>;
  change: (value: string) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<WorkspaceDialogState | null>(null);
  const close = useCallback(() => setDialog(null), []);
  const prompt = useCallback<Prompt>((title, initialValue, placeholder, confirmLabel, onConfirm, message) => {
    setDialog({ mode: 'input', title, value: initialValue, placeholder, confirmLabel, onConfirm, message });
  }, []);
  const confirm = useCallback<Confirm>((title, message, confirmLabel, onConfirm, destructive = false) => {
    setDialog({ mode: 'confirm', title, message, confirmLabel, destructive, onConfirm: () => onConfirm() });
  }, []);
  const change = useCallback((value: string) => setDialog((current) => current ? { ...current, value } : current), []);
  const submit = useCallback(async (onError: (message: string) => void) => {
    if (!dialog || (dialog.mode === 'input' && !dialog.value?.trim())) return;
    const active = dialog;
    setDialog(null);
    try {
      await active.onConfirm(active.value ?? '');
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'This action could not be completed.');
    }
  }, [dialog]);
  const value = useMemo(() => ({ dialog, close, prompt, confirm, submit, change }), [dialog, close, prompt, confirm, submit, change]);

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useDialog must be used within DialogProvider');
  return context;
}

export function DialogHost({ onError }: { onError: (message: string) => void }) {
  const { dialog, close, submit, change } = useDialog();
  return <WorkspaceDialog dialog={dialog} onClose={close} onSubmit={() => void submit(onError)} onChange={change} />;
}
