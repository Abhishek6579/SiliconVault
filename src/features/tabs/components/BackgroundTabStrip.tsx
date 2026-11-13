import { X } from 'lucide-react';
import FileKindIcon from '../../../components/FileKindIcon';
import type { Tab } from '../types';

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onOpen: (tab: Tab) => void;
  onClose: (id: string) => void;
}
export default function BackgroundTabStrip({ tabs, activeTabId, onOpen, onClose }: Props) {
  if (tabs.length === 0) return null;
  return <div className="background-tab-strip"><span>OPEN TABS</span>{tabs.map((tab) => <button key={tab.id} className={`background-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => onOpen(tab)}>{<FileKindIcon kind={tab.meta.kind} size={14} />}<span>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}<span className="background-tab-close" onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}><X size={12} /></span></button>)}</div>;
}
