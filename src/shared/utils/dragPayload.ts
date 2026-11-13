export const WORKBENCH_DRAG_TYPE = 'application/x-workbench-item';

export interface WorkbenchDragPayload {
  id: string;
  type: 'file' | 'folder';
}

export function readDragPayload(dataTransfer: Pick<DataTransfer, 'getData'>): WorkbenchDragPayload | null {
  const serialized = dataTransfer.getData(WORKBENCH_DRAG_TYPE);
  if (!serialized) return null;
  const payload: unknown = JSON.parse(serialized);
  if (typeof payload !== 'object' || payload === null) return null;
  const { id, type } = payload as Record<string, unknown>;
  if (typeof id !== 'string' || (type !== 'file' && type !== 'folder')) return null;
  return { id, type };
}

export function writeDragPayload(dataTransfer: Pick<DataTransfer, 'setData'>, payload: WorkbenchDragPayload) {
  dataTransfer.setData(WORKBENCH_DRAG_TYPE, JSON.stringify(payload));
}
