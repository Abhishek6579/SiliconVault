export async function flushPendingAutosaves(
  pendingDrafts: Map<string, string>,
  saveTimers: Map<string, ReturnType<typeof setTimeout>>,
  persist: (id: string, draft: string) => Promise<void>,
): Promise<void> {
  for (const timer of saveTimers.values()) clearTimeout(timer);
  saveTimers.clear();
  await Promise.all([...pendingDrafts.entries()].map(([id, draft]) => persist(id, draft)));
}
