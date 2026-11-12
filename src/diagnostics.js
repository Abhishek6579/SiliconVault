import { logger } from './logger.js';

let installed = false;

export function collectFrontendDiagnostics() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  const onError = (event) => {
    void logger.error('frontend.window_error', event.message || 'Unhandled window error', {
      filename: event.filename?.split(/[\\/]/).pop() || 'unknown',
      line: event.lineno || null,
      column: event.colno || null,
    });
  };
  const onRejection = (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.name + ': ' + reason.message : String(reason ?? 'Unknown rejection');
    void logger.error('frontend.unhandled_rejection', message);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  void logger.info('frontend.diagnostics_started', 'Frontend diagnostic listeners installed');
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    installed = false;
  };
}
