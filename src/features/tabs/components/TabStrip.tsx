import { Plus, X } from 'lucide-react';
import FileKindIcon from '../../../components/FileKindIcon';
import type { Tab } from '../types';

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onOpen: (tab: Tab) => void;
  onClose: (id: string) => void;
  onImport: () => void;
}
export default function TabStrip({ tabs, activeTabId, onOpen, onClose, onImport }: Props) {
  return <div className="tab-strip">
    <div className="tab-list">
      {tabs.map((tab) => <button key={tab.id} className={`file-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => onOpen(tab)}>
        {<FileKindIcon kind={tab.meta.kind} size={15} />}<span className="truncate" title={tab.meta.name}>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}
        <span role="button" tabIndex={0} className="tab-close" aria-label={`Close ${tab.meta.name}`} onClick={(event) => { event.stopPropagation(); onClose(tab.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); onClose(tab.id); } }}><X size={14} /></span>
      </button>)}
    </div>
    <button className="icon-button tab-plus" title="Import a file" onClick={onImport}><Plus size={16} /></button>
  </div>;
}
