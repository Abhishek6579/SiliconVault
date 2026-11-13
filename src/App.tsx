import AppShell from './AppShell';
import { WorkspaceNavProvider } from './features/workspace/context/WorkspaceNavContext';
import { DialogProvider } from './features/workspace/context/DialogContext';
import { ActivityProvider } from './shared/activity/ActivityContext';

export default function App() {
  return (
    <ActivityProvider>
      <WorkspaceNavProvider>
        <DialogProvider>
          <AppShell />
        </DialogProvider>
      </WorkspaceNavProvider>
    </ActivityProvider>
  );
}
