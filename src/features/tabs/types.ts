import type { FileMeta } from '../../storage/types';

export interface PdfViewState { page: number; zoom: number; fit: boolean; }
export interface Tab { id: string; meta: FileMeta; data?: Blob | string; draft: string; dirty: boolean; preview: boolean; pdfState?: PdfViewState; }
