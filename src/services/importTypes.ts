export interface ImportTarget {
  folderId: string | null;
  projectId: string | null;
  workspaceId: string;
}

export interface ImportProgress {
  completed: number;
  total: number | null;
  fileName: string;
}
