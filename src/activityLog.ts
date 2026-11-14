import { invoke } from '@tauri-apps/api/core';

type ActivityKind = 'USER_ACTION' | 'APP_RESPONSE' | 'BACKEND_CALL' | 'BACKEND_RESULT' | 'STATE';
let sequence = 0;
let currentActionId: string | null = null;
let queue: Array<Record<string, unknown>> = [];
let scheduled = false;

function cleanParams(value: unknown): unknown {
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (/password|token|secret|api.?key|content|text/i.test(key)) { result[key] = '[REDACTED]'; continue; }
      if (typeof item === 'string' && (/^[A-Z]:\\|^\//.test(item))) result[key] = item.split(/[\\/]/).pop();
      else if (typeof item === 'string' && /input|value/i.test(key)) result[key] = { length: item.length, type: 'string' };
      else result[key] = cleanParams(item);
    }
    return result;
  }
  if (typeof value === 'string') return value.length > 128 ? `${value.slice(0, 128)}…` : value;
  return value;
}
function emit(kind: ActivityKind, name: string, component: string | null, params: unknown, actionId = currentActionId, outcome: string | null = null, durationMs: number | null = null, error: unknown = null) {
  queue.push({ ts: new Date().toISOString(), seq: ++sequence, sessionId: '', actionId, kind, name, component, params: cleanParams(params) ?? {}, outcome, durationMs, error: error ? cleanParams(error) : null });
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const batch = queue.splice(0);
      // Keep diagnostics best-effort: a missing/unavailable Tauri bridge must
      // never create a second unhandled exception while recording an event.
      void Promise.resolve()
        .then(() => invoke('activity_log_events', { events: batch }))
        .catch(() => {});
    });
  }
}
export function logAction(name: string, component: string, params: unknown = {}) {
  currentActionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  emit('USER_ACTION', name, component, params, currentActionId);
  return currentActionId;
}
export function logResponse(name: string, outcome: 'success' | 'error' | 'cancelled', durationMs: number, error?: unknown) {
  emit('APP_RESPONSE', name, null, {}, currentActionId, outcome, durationMs, error);
}
export function logDiagnosticError(event: string) { emit('STATE', event, 'diagnostics', { diagnostic_event: event }, currentActionId, 'error'); }
export function logActivityState(name: string, params: unknown = {}) { emit('STATE', name, 'workspace', params, currentActionId); }
export async function trackOperation<T>(name: string, component: string, operation: () => Promise<T>): Promise<T> {
  const id = currentActionId ?? logAction(name, component);
  const started = performance.now();
  try {
    const result = await operation();
    emit('APP_RESPONSE', name, component, {}, id, result === null || result === false ? 'cancelled' : 'success', Math.round(performance.now() - started));
    return result;
  } catch (error) {
    const detail = { code: 'OPERATION_FAILED', message: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
    emit('APP_RESPONSE', name, component, {}, id, 'error', Math.round(performance.now() - started), detail);
    throw error;
  }
}
export function trackedInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const id = currentActionId;
  const started = performance.now();
  emit('BACKEND_CALL', command, 'Tauri', args ?? {}, id);
  return invoke<T>(command, args).then((result) => {
    emit('BACKEND_RESULT', command, 'Tauri', {}, id, 'success', Math.round(performance.now() - started));
    emit('APP_RESPONSE', command, null, {}, id, 'success', Math.round(performance.now() - started));
    return result;
  }, (error) => {
    const detail = error instanceof Error ? { code: 'INVOKE_FAILED', message: error.message.slice(0, 200) } : { code: 'INVOKE_FAILED', message: String(error).slice(0, 200) };
    emit('BACKEND_RESULT', command, 'Tauri', {}, id, 'error', Math.round(performance.now() - started), detail);
    emit('APP_RESPONSE', command, null, {}, id, 'error', Math.round(performance.now() - started), detail);
    throw error;
  });
}
export function installActivityHooks() {
  if (typeof window === 'undefined') return () => {};
  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest('button,[role="menuitem"],[role="tab"]') : null;
    if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
    const label = target.getAttribute('aria-label') || target.getAttribute('title') || target.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || 'unlabeled';
    const component = target.closest('[data-activity-component]')?.getAttribute('data-activity-component') || target.closest('nav,aside,header,main,[role="dialog"]')?.getAttribute('aria-label') || target.closest('nav,aside,header,main,[role="dialog"]')?.tagName.toLowerCase() || 'application';
    logAction('click', component, { label, element: target.tagName.toLowerCase() });
  };
  const submit = (event: Event) => { const form = event.target; logAction('form.submit', form instanceof HTMLFormElement ? form.getAttribute('aria-label') || form.id || 'form' : 'form', {}); };
  const change = (event: Event) => { const field = event.target; if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return; const name = field.getAttribute('aria-label') || field.name || field.id || 'field'; const type = field instanceof HTMLInputElement ? field.type : field instanceof HTMLSelectElement ? 'select' : 'textarea'; const length = 'value' in field && typeof field.value === 'string' ? field.value.length : undefined; logAction('field.change', field.closest('[data-activity-component]')?.getAttribute('data-activity-component') || 'form', { field: name, type, length }); };
  const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey || event.altKey) && !/INPUT|TEXTAREA/.test((event.target as Element)?.tagName ?? '')) logAction('keyboard.shortcut', 'application', { key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey }); };
  const focus = () => emit('STATE', 'window.focus', 'window', {});
  const navigation = () => emit('STATE', 'navigation.changed', 'window', { path: location.pathname });
  document.addEventListener('click', click, true); document.addEventListener('submit', submit, true); document.addEventListener('change', change, true); document.addEventListener('keydown', key, true); window.addEventListener('focus', focus); window.addEventListener('popstate', navigation);
  return () => { document.removeEventListener('click', click, true); document.removeEventListener('submit', submit, true); document.removeEventListener('change', change, true); document.removeEventListener('keydown', key, true); window.removeEventListener('focus', focus); window.removeEventListener('popstate', navigation); };
}
export function prettyPrintSession(contents: string): string {
  return contents.split(/\r?\n/).filter(Boolean).map((line) => {
    try { const e = JSON.parse(line); const ts = new Date(e.ts).toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 }); const kind = e.kind === 'USER_ACTION' ? 'USER' : e.kind; const label = e.component ? `${e.component} > ${e.name}` : e.name; return `${ts}  ${kind}  ${label}  →  ${e.outcome ?? '—'}${e.durationMs == null ? '' : ` ${e.durationMs}ms`}`; } catch { return line; }
  }).join('\n');
}
