import AppShell from './AppShell';
import { WorkspaceNavProvider } from './features/workspace/context/WorkspaceNavContext';
import { DialogProvider } from './features/workspace/context/DialogContext';

export default function App() {
  return (
    <WorkspaceNavProvider>
      <DialogProvider>
        <AppShell />
      </DialogProvider>
    </WorkspaceNavProvider>
  );
}
