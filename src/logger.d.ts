export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface DiagnosticLogger {
  debug(event: string, message: string, context?: unknown): Promise<void>;
  info(event: string, message: string, context?: unknown): Promise<void>;
  warn(event: string, message: string, context?: unknown): Promise<void>;
  error(event: string, message: string, context?: unknown): Promise<void>;
  fatal(event: string, message: string, context?: unknown): Promise<void>;
}
export function log(level: DiagnosticLevel, event: string, message: string, context?: unknown): Promise<void>;
export const logger: DiagnosticLogger;
