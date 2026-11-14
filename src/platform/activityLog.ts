import { invoke } from '@tauri-apps/api/core';

/** Send a batch of activity events through the native Tauri bridge. */
export function sendActivityLogEvents(events: Array<Record<string, unknown>>): Promise<void> {
  return invoke<void>('activity_log_events', { events });
}

/** Invoke a native Tauri command without leaking the bridge into application modules. */
export function invokePlatformCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}
