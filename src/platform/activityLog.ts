import { invoke } from '@tauri-apps/api/core';

/** Send a batch of activity events through the native Tauri bridge. */
export function sendActivityLogEvents(events: Array<Record<string, unknown>>): Promise<void> {
  return invoke<void>('activity_log_events', { events });
}
