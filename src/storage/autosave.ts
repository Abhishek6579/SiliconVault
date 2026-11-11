export async function flushPendingAutosaves(
  pendingDrafts: Map<string, string>,
  saveTimers: Map<string, ReturnType<typeof setTimeout>>,
  persist: (id: string, draft: string) => Promise<void>,
): Promise<void> {
  while (pendingDrafts.size > 0) {
    for (const timer of saveTimers.values()) clearTimeout(timer);
    saveTimers.clear();
    const pending = [...pendingDrafts.entries()];
    await Promise.all(pending.map(([id, draft]) => persist(id, draft)));
  }
}
