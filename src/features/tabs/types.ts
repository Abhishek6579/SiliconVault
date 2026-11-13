import type { FileMeta } from '../../storage/types';

export interface PdfViewState { page: number; zoom: number; fit: boolean; }
export interface ViewerViewState { zoom: number; scrollTop: number; scrollLeft: number; }
export interface EditorViewState { anchor: number; head: number; scrollTop: number; scrollLeft: number; preview: boolean; }
export interface Tab { id: string; meta: FileMeta; data?: Blob | string; hydrated?: boolean; draft: string; dirty: boolean; preview: boolean; pdfState?: PdfViewState; viewerState?: ViewerViewState; editorState?: EditorViewState; }
