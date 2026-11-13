import { platform } from './platform/index.ts';
import { sanitizeDiagnosticText } from './shared/logging/sanitize.ts';

const LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
const MAX_MESSAGE_LENGTH = 2048;

function sanitize(value) { return sanitizeDiagnosticText(value, MAX_MESSAGE_LENGTH); }

export async function log(level, event, message, context = undefined) {
  const normalizedLevel = LEVELS.has(level) ? level : 'info';
  const safeEvent = sanitize(event).replace(/\s+/g, '.').slice(0, 128) || 'frontend.event';
  let line = sanitize(message);
  if (context !== undefined) {
    try { line += ' ' + sanitize(JSON.stringify(context)); } catch { line += ' [context unavailable]'; }
  }
  try {
    if (import.meta.env.DEV) {
      const method = normalizedLevel === 'debug' ? 'debug' : normalizedLevel;
      console[method]('[SiliconVault:' + safeEvent + ']', line);
    }
  } catch { /* console failures must not affect application workflows */ }
  try { await platform.log(normalizedLevel, safeEvent, line); } catch { /* logging must not interrupt workspace workflows */ }
}

export const logger = Object.freeze({
  debug: (event, message, context) => log('debug', event, message, context),
  info: (event, message, context) => log('info', event, message, context),
  warn: (event, message, context) => log('warn', event, message, context),
  error: (event, message, context) => log('error', event, message, context),
  fatal: (event, message, context) => log('fatal', event, message, context),
});
