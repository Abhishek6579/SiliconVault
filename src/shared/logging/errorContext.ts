export interface DiagnosticErrorContext {
  errorName: string;
  errorMessage: string;
  stack?: string;
}

/** Returns bounded error details; the logger sanitizes them again at its boundary. */
export function errorContext(reason: unknown): DiagnosticErrorContext {
  try {
    if (reason instanceof Error) {
      return {
        errorName: reason.name || 'Error',
        errorMessage: reason.message || 'No error message was provided.',
        ...(reason.stack ? { stack: reason.stack } : {}),
      };
    }
    return { errorName: typeof reason, errorMessage: String(reason) };
  } catch {
    return { errorName: 'UnknownError', errorMessage: 'The error value could not be inspected.' };
  }
}
