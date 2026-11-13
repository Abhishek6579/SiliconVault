import { logger } from './logger.js';
import { errorContext } from './shared/logging/errorContext';

let installed = false;

export function collectFrontendDiagnostics() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  const onError = (event) => {
    void logger.error('frontend.window_error', 'An uncaught window error occurred.', {
      ...errorContext(event.error ?? event.message),
      filename: event.filename?.split(/[\\/]/).pop() || 'unknown',
      line: event.lineno || null, column: event.colno || null,
    });
  };
  const onRejection = (event) => {
    const reason = event.reason;
    void logger.error('frontend.unhandled_rejection', 'An unhandled promise rejection occurred.', errorContext(reason));
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
