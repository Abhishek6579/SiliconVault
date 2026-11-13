import type { FileKind } from '../../storage/types';

export const OPENABLE_KINDS: ReadonlySet<FileKind> = new Set([
  'pdf', 'markdown', 'code', 'text', 'viewer',
]);

export function isEditableKind(kind: FileKind): kind is 'markdown' | 'code' | 'text' {
  return kind === 'code' || kind === 'text' || kind === 'markdown';
}
