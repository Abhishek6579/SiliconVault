export interface CancellableRenderTask { cancel(): void; }
export interface DestroyablePdfResource { destroy(): Promise<unknown> | unknown; }

/** Release renderer tasks and exactly one active PDF.js owner during unmount/source replacement. */
export function disposePdfResources(
  renderTasks: Map<number, CancellableRenderTask>,
  loadingTask: DestroyablePdfResource | null,
  loadedDocument: DestroyablePdfResource | null,
): void {
  for (const task of renderTasks.values()) {
    try { task.cancel(); } catch { /* A task may already have completed or been cancelled. */ }
  }
  renderTasks.clear();
  if (loadingTask) void loadingTask.destroy();
  else if (loadedDocument) void loadedDocument.destroy();
}
