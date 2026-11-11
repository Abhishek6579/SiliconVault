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
  const resource = loadingTask ?? loadedDocument;
  if (resource) {
    // PDF.js destruction is asynchronous; never leak a rejected cleanup promise.
    try {
      void Promise.resolve(resource.destroy()).catch(() => {
        // Cleanup is best-effort after the owning component has been disposed.
      });
    } catch {
      // Some adapters may throw synchronously while beginning destruction.
    }
  }
}
