export interface PlatformAdapter {
  readonly kind: 'web' | 'desktop';
  log(level: string, event: string, message: string): Promise<void>;
  getSystemStats(): Promise<{ cpu: number | null; ram: number | null; gpu: number | null }>;
  getDiagnostics(): Promise<unknown>;
  exportDiagnostics(): Promise<string>;
  convertOfficeToPdf(bytes: Uint8Array, extension: string): Promise<Uint8Array>;
  checkForUpdate(): Promise<{ version: string; notes?: string | null } | null>;
  installUpdate(): Promise<void>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  onCloseRequested(handler: (retryClose: () => Promise<void>) => Promise<void>): Promise<() => void>;
  saveBackup(content: string | ReadableStream<Uint8Array>): Promise<boolean>;
  saveDiagnostics(content: string): Promise<boolean>;
  chooseBackup(): Promise<File | null>;
  chooseFiles(): AsyncGenerator<File>;
  chooseFolderFiles(): AsyncGenerator<File>;
}
