import { invoke } from '@tauri-apps/api/core';

const LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const MAX_MESSAGE_LENGTH = 2048;

function sanitize(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_MESSAGE_LENGTH);
}

export async function log(level, event, message, context = undefined) {
  const normalizedLevel = LEVELS.has(level) ? level : 'info';
  const safeEvent = sanitize(event).replace(/\s+/g, '.').slice(0, 128) || 'frontend.event';
  let line = sanitize(message);
  if (context !== undefined) {
    try { line += ' ' + sanitize(JSON.stringify(context)); } catch { line += ' [context unavailable]'; }
  }
  if (import.meta.env.DEV) {
    const method = normalizedLevel === 'debug' ? 'debug' : normalizedLevel;
    console[method]('[SiliconVault:' + safeEvent + ']', line);
  }
  try { await invoke('log_frontend_event', { level: normalizedLevel, event: safeEvent, message: line }); } catch { /* logging must not interrupt workspace workflows */ }
}

export const logger = Object.freeze({
  debug: (event, message, context) => log('debug', event, message, context),
  info: (event, message, context) => log('info', event, message, context),
  warn: (event, message, context) => log('warn', event, message, context),
  error: (event, message, context) => log('error', event, message, context),
});
