import { lazy, Suspense, type Dispatch, type Ref, type RefObject, type SetStateAction } from 'react';
import { File } from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import FileKindIcon from '../../../components/FileKindIcon';
import { formatSize } from '../../../utils/format';
import { isEditableKind } from '../../../shared/constants/fileKinds';
import WorkspaceEditor from '../../editor/components/WorkspaceEditor';
import TabStrip from './TabStrip';
import EditorTitlebar from './EditorTitlebar';
import type { Tab, PdfViewState, ViewerViewState } from '../types';
import type { Folder } from '../../../storage/types';

const PdfReader = lazy(() => import('../../../PdfReader'));
const ReadOnlyFileViewer = lazy(() => import('../../../viewers/ReadOnlyFileViewer'));

interface Data {
  activeTab: Tab;
  workspaceTabs: Tab[];
  activeTabId: string | null;
  editorFontSize: number;
  editorWorkspaceRef: RefObject<HTMLDivElement | null>;
  editorViewRef: RefObject<EditorView | null>;
  folders: Folder[];
  getProjectName: (id: string | null) => string | undefined;
  focusMode: boolean;
}
interface Actions {
  onOpenTab: (tab: Tab) => void;
  onCloseTab: (id: string) => void;
  onImport: () => void;
  onFontSizeChange: Dispatch<SetStateAction<number>>;
  onTogglePreview: () => void;
  onSave: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleFocus: () => void;
  updatePdfView: (id: string, state: PdfViewState) => void;
  updateViewerView: (id: string, state: ViewerViewState) => void;
  updateDraft: (id: string, value: string) => void;
  persistEditorViewState: (id: string, view: EditorView, preview: boolean) => void;
}
export default function EditorSurface({ data, actions }: { data: Data; actions: Actions }) {
  const { activeTab, workspaceTabs, activeTabId, editorFontSize, editorWorkspaceRef, editorViewRef, folders, getProjectName, focusMode } = data;
  return <div ref={editorWorkspaceRef as RefObject<HTMLDivElement>} className="editor-workspace">
    <TabStrip tabs={workspaceTabs} activeTabId={activeTabId} onOpen={actions.onOpenTab} onClose={actions.onCloseTab} onImport={actions.onImport} />
    <EditorTitlebar
      activeTab={activeTab}
      folders={folders}
      getProjectName={getProjectName}
      editorFontSize={editorFontSize}
      focusMode={focusMode}
      onFontSizeChange={actions.onFontSizeChange}
      onTogglePreview={actions.onTogglePreview}
      onSave={actions.onSave}
      onRename={actions.onRename}
      onDelete={actions.onDelete}
      onToggleFocus={actions.onToggleFocus}
    />
    {activeTab.meta.kind === 'pdf' && <div className="pdf-tabs-host"><div className="pdf-tab-host" key={activeTab.id}>
      {activeTab.data ? <Suspense fallback={<div className="loading-state">Loading PDF tools…</div>}>
        <PdfReader tabId={activeTab.id} data={activeTab.data} title={activeTab.meta.name} initialState={activeTab.pdfState} onStateChange={actions.updatePdfView} />
      </Suspense> : <div className="loading-state">Preparing PDF…</div>}
    </div></div>}
    {activeTab.meta.kind === 'pdf' || activeTab.meta.kind === 'viewer' ? null : isEditableKind(activeTab.meta.kind) ? (
      <WorkspaceEditor
        kind={activeTab.meta.kind}
        name={activeTab.meta.name}
        value={activeTab.draft}
        fontSize={editorFontSize}
        preview={activeTab.preview}
        editorState={activeTab.editorState}
        editorViewRef={activeTab.meta.kind === 'markdown' ? editorViewRef : undefined}
        onChange={(value) => actions.updateDraft(activeTab.id, value)}
        onViewStateChange={(view, preview) => actions.persistEditorViewState(activeTab.id, view, preview)}
      />
    ) : <div className="unsupported-file"><div className="unsupported-icon"><File size={26} /></div><h2>Preview unavailable</h2><p>This file is saved in your workspace. Download it through a backup or open it in another app.</p><span>{formatSize(activeTab.meta.size)} · {activeTab.meta.mimeType}</span></div>}
    {workspaceTabs.filter((tab) => tab.meta.kind === 'viewer' && tab.data instanceof Blob).map((tab) => (
      <div key={tab.id} className="persistent-viewer-panel" style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}>
        <Suspense fallback={<div className="loading-state">Loading file viewer…</div>}>
          <ReadOnlyFileViewer
            tabId={tab.id}
            fileName={tab.meta.name}
            data={tab.data}
            mimeType={tab.meta.mimeType}
            initialState={tab.viewerState}
            initialPdfState={tab.pdfState}
            onStateChange={actions.updateViewerView}
            onPdfStateChange={actions.updatePdfView}
          />
        </Suspense>
      </div>
    ))}
    <footer className="editor-footer"><span>{activeTab.meta.kind === 'code' ? 'Code editor' : activeTab.meta.kind === 'text' ? 'Text editor' : activeTab.meta.kind === 'viewer' ? 'Read-only viewer' : activeTab.meta.kind === 'markdown' ? 'Markdown' : activeTab.meta.kind === 'pdf' ? 'PDF document' : 'File'}{activeTab.dirty ? ' · Unsaved changes' : ''}</span><span>{formatSize(activeTab.meta.size)}</span></footer>
  </div>;
}
