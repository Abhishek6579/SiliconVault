import { BookOpen, File, FileCode2, FileText } from 'lucide-react';
import type { FileKind } from '../storage/types';

interface FileKindIconProps {
  kind: FileKind;
  size?: number;
}

export default function FileKindIcon({ kind, size = 16 }: FileKindIconProps) {
  if (kind === 'pdf') return <FileText size={size} className="file-kind pdf-kind" />;
  if (kind === 'markdown') return <BookOpen size={size} className="file-kind md-kind" />;
  if (kind === 'code') return <FileCode2 size={size} className="file-kind code-kind" />;
  return <File size={size} className="file-kind" />;
}
