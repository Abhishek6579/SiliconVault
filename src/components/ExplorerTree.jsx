import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus,
  FilePlus2, Layers3, Plus, FolderTree
} from 'lucide-react';

function FolderNode({ folder, folders, selectedFolderId, onSelectFolder, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const children = folders.filter(item => item.parentFolderId === folder.id);
  const active = selectedFolderId === folder.id;

  return (
    <div>
      <div className={`explorer-row ${active ? 'selected' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
        <button
          className="explorer-disclosure"
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
        >
          {children.length ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="explorer-spacer" />}
        </button>
        <button className="explorer-entry" onClick={() => onSelectFolder(folder)}>
          {expanded && children.length ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span title={folder.name}>{folder.name}</span>
        </button>
      </div>
      {expanded && children.map(child => (
        <FolderNode
          key={child.id}
          folder={child}
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export default function ExplorerTree({
  folders = [],
  projects = [],
  selectedFolderId,
  selectedProjectId,
  onSelectFolder,
  onSelectProject,
  onCreateFolder,
  onCreateProject
}) {
  const [expandedProjects, setExpandedProjects] = useState({});
  const personalFolders = useMemo(
    () => folders.filter(folder => folder.projectId == null && folder.parentFolderId == null),
    [folders]
  );

  return (
    <section className="explorer">
      <div className="explorer-heading">
        <span>EXPLORER</span>
        <div className="explorer-tools">
          <button title="New folder" onClick={() => onCreateFolder(selectedFolderId ?? null, selectedProjectId ?? null)}><FolderPlus size={14} /></button>
          <button title="New project" onClick={onCreateProject}><Plus size={15} /></button>
        </div>
      </div>

      <div className="explorer-section-label">
        <span>PROJECTS</span>
      </div>

      {projects.map(project => {
        const root = folders.find(folder => folder.id === project.rootFolderId);
        const expanded = expandedProjects[project.id] ?? false;
        const projectActive = selectedProjectId === project.id;

        return (
          <div key={project.id} className="explorer-project">
            <div className={`explorer-row ${projectActive ? 'selected' : ''}`}>
              <button
                className="explorer-disclosure"
                onClick={() => setExpandedProjects(current => ({ ...current, [project.id]: !expanded }))}
                aria-label={expanded ? 'Collapse project' : 'Expand project'}
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button className="explorer-entry" onClick={() => onSelectProject(project)}>
                <Layers3 size={15} />
                <span title={project.name}>{project.name}</span>
              </button>
              <button className="explorer-inline-action" title="New folder in project" onClick={() => onCreateFolder(root?.id ?? null, project.id)}>
                <FolderPlus size={13} />
              </button>
            </div>
            {expanded && root && (
              <div className="explorer-project-tree">
                {folders.filter(folder => folder.parentFolderId === root.id).map(folder => (
                  <FolderNode
                    key={folder.id}
                    folder={folder}
                    folders={folders}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    depth={1}
                  />
                ))}
                <button className="explorer-root-link" onClick={() => onSelectFolder(root)}>
                  <Folder size={14} /> Project root
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div className="explorer-section-label explorer-section-spaced">
        <span>WORKSPACE FOLDERS</span>
      </div>
      {personalFolders.map(folder => (
        <FolderNode
          key={folder.id}
          folder={folder}
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
        />
      ))}
      {!personalFolders.length && <p className="explorer-empty">No personal folders yet</p>}
    </section>
  );
}
