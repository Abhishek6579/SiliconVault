import { BookOpen, Code2, FileText, Import, Plus, Sparkles } from 'lucide-react';

interface WelcomePageProps {
  onCreateProject: () => void;
  onImportFiles: () => void;
  onCreateNote: () => void;
  onCreateCodeFile: () => void;
}

export default function WelcomePage({ onCreateProject, onImportFiles, onCreateNote, onCreateCodeFile }: WelcomePageProps) {
  return <div className="welcome-page">
    <div className="welcome-kicker"><Sparkles size={15} /> LOCAL ENGINEERING WORKSPACE</div>
    <h1>Your work, in one place.</h1>
    <p>Keep technical notes, PDFs and source files organized on this device.</p>
    <div className="welcome-actions"><button className="primary-button large" onClick={onCreateProject}><Plus size={17} /> Create a project</button><button className="text-button large" onClick={onImportFiles}><Import size={16} /> Import files</button></div>
    <div className="feature-grid">
      <button className="feature-card" onClick={onCreateNote}><div className="feature-icon note"><BookOpen size={18} /></div><b>Technical notes</b><span>Markdown with math and diagrams</span><Plus size={15} className="feature-plus" /></button>
      <button className="feature-card" onClick={onCreateCodeFile}><div className="feature-icon code"><Code2 size={18} /></div><b>Source files</b><span>Write and save code locally</span><Plus size={15} className="feature-plus" /></button>
      <button className="feature-card" onClick={onImportFiles}><div className="feature-icon pdf"><FileText size={18} /></div><b>Reference PDFs</b><span>Read and search your documents</span><Plus size={15} className="feature-plus" /></button>
    </div>
  </div>;
}
