import { createContext, useCallback, useContext, useMemo, useReducer, type Dispatch, type PropsWithChildren, type SetStateAction } from 'react';

export type WorkspaceView = 'workspace' | 'recent' | 'trash';
interface WorkspaceNavState {
  view: WorkspaceView;
  activeProject: string | null;
  selectedFolder: string | null;
  expanded: Set<string>;
}
type StateKey = keyof WorkspaceNavState;
type Action = { [K in StateKey]: { key: K; value: SetStateAction<WorkspaceNavState[K]> } }[StateKey];

interface WorkspaceNavValue extends WorkspaceNavState {
  setView: Dispatch<SetStateAction<WorkspaceView>>;
  setActiveProject: Dispatch<SetStateAction<string | null>>;
  setSelectedFolder: Dispatch<SetStateAction<string | null>>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
}

const WorkspaceNavContext = createContext<WorkspaceNavValue | null>(null);

function reducer(state: WorkspaceNavState, action: Action): WorkspaceNavState {
  const value = typeof action.value === 'function'
    ? (action.value as (previous: WorkspaceNavState[typeof action.key]) => WorkspaceNavState[typeof action.key])(state[action.key])
    : action.value;
  return { ...state, [action.key]: value };
}

export function WorkspaceNavProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, {
    view: 'workspace', activeProject: null, selectedFolder: null, expanded: new Set<string>(),
  });
  const setView = useCallback((value: SetStateAction<WorkspaceView>) => dispatch({ key: 'view', value }), []);
  const setActiveProject = useCallback((value: SetStateAction<string | null>) => dispatch({ key: 'activeProject', value }), []);
  const setSelectedFolder = useCallback((value: SetStateAction<string | null>) => dispatch({ key: 'selectedFolder', value }), []);
  const setExpanded = useCallback((value: SetStateAction<Set<string>>) => dispatch({ key: 'expanded', value }), []);
  const value = useMemo(() => ({ ...state, setView, setActiveProject, setSelectedFolder, setExpanded }), [state, setView, setActiveProject, setSelectedFolder, setExpanded]);
  return <WorkspaceNavContext.Provider value={value}>{children}</WorkspaceNavContext.Provider>;
}

export function useWorkspaceNav() {
  const value = useContext(WorkspaceNavContext);
  if (!value) throw new Error('useWorkspaceNav must be used inside WorkspaceNavProvider.');
  return value;
}
