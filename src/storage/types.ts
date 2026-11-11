export type FileKind = 'pdf' | 'markdown' | 'code' | 'other';

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface FileMeta {
  id: string;
  workspaceId: string;
  kind: FileKind;
  name: string;
  parentFolderId: string | null;
  projectId: string | null;
  size: number;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface FileContent {
  fileId: string;
  data: Blob | string;
}

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  parentFolderId: string | null;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspacePreference {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface BackupFile {
  meta: FileMeta;
  content: { encoding: 'text' | 'base64'; value: string };
  sha256: string;
}

export interface WorkspaceBackup {
  format: 'engineering-workspace-backup';
  version: 1;
  exportedAt: number;
  files: BackupFile[];
  folders: Folder[];
  projects: Project[];
  workspaces?: Workspace[];
  preferences?: WorkspacePreference[];
}
