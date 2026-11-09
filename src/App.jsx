import React, { useMemo, useState } from 'react';
import {
  Activity, Archive, ArrowDownToLine, ArrowUpRight, Bell, BookOpen, Bookmark,
  ChevronDown, ChevronRight, CircleHelp, Code2, Command, Cpu, FileCode2, FilePlus2,
  FileText, Folder, FolderOpen, HardDrive, Home, Layers3, LayoutGrid, List, Plus,
  Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X, Zap
} from 'lucide-react';
import { documents, folders, projects } from './data/mockData';

const nav = [
  { label: 'Workspace', items: [{name:'Overview', icon:Home},{name:'Documents',icon:FileText,count:'45'},{name:'Code Studio',icon:Code2,count:'18'},{name:'Library',icon:Archive,count:'12'},{name:'Projects',icon:Layers3,count:'3'}]},
  { label: 'Manage', items: [{name:'Activity',icon:Activity},{name:'Bookmarks',icon:Bookmark}] },
];
function App(){
  const [active,setActive]=useState('Overview');
  const [view,setView]=useState('list');
  const [query,setQuery]=useState('');
  const [menu,setMenu]=useState(false);
  const [notice,setNotice]=useState('');
  const filtered=useMemo(()=>documents.filter(d=>(d.title+' '+d.folder+' '+d.type).toLowerCase().includes(query.toLowerCase())),[query]);
  const title=active==='Overview'?'Workspace overview':active;
  const notify=(s)=>{setNotice(s);setTimeout(()=>setNotice(''),2600)};
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Cpu size={17}/></div><span>Silicon<span className="brand-light">Vault</span></span><span className="local-dot" title="Local workspace"/></div>
      <div className="workspace-switch"><div className="workspace-avatar">SV</div><div className="workspace-meta"><b>Personal workspace</b><small>Local · This device</small></div><ChevronDown size={14}/></div>
      <div className="side-scroll">
        {nav.map(group=><div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item=><button key={item.name} className={'nav-item '+(active===item.name?'active':'')} onClick={()=>setActive(item.name)}><item.icon size={16}/><span>{item.name}</span>{item.count&&<small>{item.count}</small>}</button>)}</div>)}
        <div className="nav-group"><div className="nav-label">Collections <button className="tiny-add" onClick={()=>notify('Collection creation will be enabled in Phase 2.')}><Plus size={13}/></button></div>
          {folders.map(f=><button key={f.name} className="nav-item folder-nav" onClick={()=>{setActive('Documents');setQuery(f.name)}}><Folder size={15}/><span>{f.name}</span></button>)}
        </div>
      </div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={()=>setActive('Settings')}><Settings size={16}/><span>Settings</span></button><div className="storage-card"><div className="storage-head"><HardDrive size={14}/><span>Local storage</span><span className="storage-state">READY</span></div><div className="storage-bar"><i/></div><small>Browser workspace · Phase 1 demo</small></div><div className="profile"><div className="profile-avatar">A</div><div><b>Personal vault</b><small>Private workspace</small></div><CircleHelp size={16}/></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>SiliconVault</span><ChevronRight size={13}/><b>{title}</b></div><div className="top-actions"><div className="searchbox"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search anything..."/><kbd>⌘ K</kbd></div><button className="icon-btn" onClick={()=>notify('You are all caught up.')}><Bell size={17}/></button><button className="avatar-mini">A</button></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">MONDAY, NOVEMBER 09, 2026 <span className="eyebrow-line"/></div><h1>{title}</h1><p className="subheading">Your engineering knowledge, organized in one place.</p></div><div className="heading-actions"><button className="button secondary" onClick={()=>notify('Import flow will be added in Phase 5.')}><Upload size={15}/> Import</button><div className="relative"><button className="button primary" onClick={()=>setMenu(!menu)}><Plus size={16}/> Create new <ChevronDown size={14}/></button>{menu&&<div className="dropdown"><button onClick={()=>{setMenu(false);notify('Markdown editor is coming in Phase 3.')}}><FileText size={15}/> New document</button><button onClick={()=>{setMenu(false);notify('Code workspace is coming in Phase 4.')}}><FileCode2 size={15}/> New code file</button><button onClick={()=>{setMenu(false);notify('Project creation is coming in Phase 6.')}}><Layers3 size={15}/> New project</button></div>}</div></div></div>
        <section className="stats-grid">
          <div className="stat-card"><div className="stat-top"><span>Total documents</span><div className="stat-icon blue"><FileText size={16}/></div></div><strong>45</strong><small><span className="positive">+6</span> this month</small></div>
          <div className="stat-card"><div className="stat-top"><span>Code files</span><div className="stat-icon purple"><Code2 size={16}/></div></div><strong>18</strong><small>Verilog · SystemVerilog</small></div>
          <div className="stat-card"><div className="stat-top"><span>Projects</span><div className="stat-icon green"><Layers3 size={16}/></div></div><strong>3</strong><small>2 currently active</small></div>
          <div className="stat-card"><div className="stat-top"><span>Storage used</span><div className="stat-icon amber"><HardDrive size={16}/></div></div><strong>128 <em>MB</em></strong><small>Stored on this device</small></div>
        </section>
        <section className="section-block">
          <div className="section-heading"><div><h2>Collections</h2><p>Jump back into a subject</p></div><button className="text-button" onClick={()=>setActive('Documents')}>All collections <ArrowUpRight size={14}/></button></div>
          <div className="collection-grid">{folders.map((f,i)=><button className="collection-card" key={f.name} onClick={()=>{setActive('Documents');setQuery(f.name)}}><div className={'folder-art '+f.color}><FolderOpen size={25}/></div><div className="collection-info"><b>{f.name}</b><small>{f.count} items</small></div><ChevronRight size={15} className="collection-arrow"/></button>)}</div>
        </section>
        <section className="section-block">
          <div className="section-heading"><div><h2>Recent files</h2><p>Pick up where you left off</p></div><div className="view-controls"><button className={view==='list'?'selected':''} onClick={()=>setView('list')} title="List view"><List size={15}/></button><button className={view==='grid'?'selected':''} onClick={()=>setView('grid')} title="Grid view"><LayoutGrid size={15}/></button><button className="text-button view-all" onClick={()=>setActive('Documents')}>View all <ArrowUpRight size={14}/></button></div></div>
          {view==='list'?<div className="file-table"><div className="table-head"><span>NAME</span><span>LOCATION</span><span>TYPE</span><span>LAST MODIFIED</span><span>SIZE</span><span/></div>{filtered.map((d,i)=><button className="file-row" key={d.title} onClick={()=>notify(`${d.title} — editor will be connected in a later phase.`)}><span className="file-name"><span className={'file-icon '+(d.icon==='pdf'?'pdf':d.icon==='code'?'code':'doc')}>{d.icon==='pdf'?'PDF':d.icon==='code'?'V':'MD'}</span><b>{d.title}</b></span><span className="muted">{d.folder}</span><span><i className="type-pill">{d.type}</i></span><span className="muted">{d.updated}</span><span className="muted mono">{d.size}</span><span><ChevronRight size={15}/></span></button>)}</div>:<div className="file-grid">{filtered.map(d=><button className="file-tile" key={d.title} onClick={()=>notify(`${d.title} — editor will be connected in a later phase.`)}><div className="tile-top"><span className={'file-icon '+(d.icon==='pdf'?'pdf':d.icon==='code'?'code':'doc')}>{d.icon==='pdf'?'PDF':d.icon==='code'?'V':'MD'}</span><span className="type-pill">{d.type}</span></div><b>{d.title}</b><small>{d.folder}</small><div className="tile-foot"><span>{d.updated}</span><span>{d.size}</span></div></button>)}</div>}
          {filtered.length===0&&<div className="empty-state"><Search size={22}/><b>No matching files</b><span>Try another search term.</span></div>}
        </section>
        <section className="section-block projects-section"><div className="section-heading"><div><h2>Active projects</h2><p>Your ongoing engineering work</p></div><button className="text-button" onClick={()=>setActive('Projects')}>Manage projects <ArrowUpRight size={14}/></button></div><div className="project-grid">{projects.map(p=><div className="project-card" key={p.name}><div className="project-top"><div className={'project-symbol '+p.color}><Cpu size={17}/></div><button className="more-button" onClick={()=>notify(`${p.name} project actions coming soon.`)}>•••</button></div><b>{p.name}</b><small>{p.detail}</small><div className="progress-meta"><span>Progress</span><b>{p.progress}%</b></div><div className="progress-track"><i style={{width:p.progress+'%'}}/></div></div>)}</div></section>
        <footer className="footer"><span>SiliconVault <i>v0.1.0 · Phase 1</i></span><span><span className="green-dot"/> Local-first · Your data stays yours</span></footer>
      </div>
    </main>
    {notice&&<div className="toast"><Sparkles size={15}/>{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
  </div>
}
export default App;
