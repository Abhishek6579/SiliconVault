import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import PdfReader from '../PdfReader';
import { isDesktopApp } from '../platform/desktop';
import OfficeOoxmlViewer from './OfficeOoxmlViewer';

interface Props { fileName: string; data?: Blob | string; mimeType: string; maximized: boolean; onToggleMaximize: () => void; }

export function rowsFrom(source: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < source.length && rows.length < 201; i++) {
    const c = source[i];
    if (c === '"' && quoted && source[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && source[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.slice(0, 200).map((r) => r.slice(0, 30));
}


export default function ReadOnlyFileViewer({ fileName, data, mimeType }: Props) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext) || mimeType.startsWith('image/');
  const isTextPreview = ['v', 'sv', 'vh', 'svh', 'sp', 'cir', 'lib', 'kicad_sch', 'vcd', 'csv', 'tsv'].includes(ext);
  const officePdfExtensions = ['doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'rtf', 'odt', 'fodt', 'xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'fods', 'ppt', 'pptx', 'pptm', 'pot', 'potx', 'potm', 'pps', 'ppsx', 'ppsm', 'odp', 'fodp'];
  const browserOoxmlExtensions = ['docx', 'docm', 'xlsx', 'xlsm', 'pptx', 'pptm'];
  const isOffice = officePdfExtensions.includes(ext);
  const isBrowserOoxml = browserOoxmlExtensions.includes(ext);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [officePdf, setOfficePdf] = useState<Blob | null>(null);
  const [officeLoading, setOfficeLoading] = useState(false);
  const [officeError, setOfficeError] = useState('');
  const [officeRenderFailure, setOfficeRenderFailure] = useState<{ data: Blob; extension: string; message: string } | null>(null);
  const hasOfficeRenderFailure = data instanceof Blob
    && officeRenderFailure?.data === data
    && officeRenderFailure.extension === ext;
  const handleOfficeRenderError = useCallback((reason: Error) => {
    if (data instanceof Blob) {
      setOfficeRenderFailure({ data, extension: ext, message: reason.message });
    }
  }, [data, ext]);

  useEffect(() => {
    setError(''); setText(''); setUrl(''); setZoom(1);
    if (!(data instanceof Blob)) { setText(typeof data === 'string' ? data : ''); return; }
    if (!isImage && !isTextPreview) return;
    if (isImage) {
      const objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    let active = true;
    if (data.size > 24 * 1024 * 1024) { setError('Text preview is limited to 24 MB to protect memory usage.'); return; }
    data.text().then((value) => { if (active) setText(value); }).catch(() => { if (active) setError('Could not decode this file as text.'); });
    return () => { active = false; };
  }, [data, isImage, isTextPreview]);

  useEffect(() => {
    if (!isOffice) return;
    let active = true;
    setOfficePdf(null);
    setOfficeError('');

    const requiresConversion = !isBrowserOoxml || hasOfficeRenderFailure;
    if (!requiresConversion) {
      setOfficeLoading(false);
      return () => { active = false; };
    }

    setOfficeLoading(true);
    if (!(data instanceof Blob)) {
      setOfficeError('The Office document data is unavailable.');
      setOfficeLoading(false);
      return () => { active = false; };
    }

    if (!isDesktopApp()) {
      const message = hasOfficeRenderFailure
        ? `The browser Office renderer failed: ${officeRenderFailure?.message ?? 'Unknown rendering error.'}`
        : 'This legacy Office format requires the desktop app with LibreOffice or ONLYOFFICE Document Builder configured.';
      setOfficeError(message);
      setOfficeLoading(false);
      return () => { active = false; };
    }

    data.arrayBuffer()
      .then((buffer) => invoke<number[]>('convert_office_to_pdf', {
        bytes: Array.from(new Uint8Array(buffer)),
        extension: ext,
      }))
      .then((bytes) => {
        if (active) setOfficePdf(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const conversionError = reason instanceof Error ? reason.message : 'Could not convert this Office document to PDF.';
        const rendererDetail = hasOfficeRenderFailure
          ? ` The browser renderer also failed: ${officeRenderFailure?.message ?? 'Unknown rendering error.'}`
          : '';
        setOfficeError(`Office-to-PDF conversion failed: ${conversionError}.${rendererDetail} Configure ONLYOFFICE Document Builder or install LibreOffice to preview this file.`);
      })
      .finally(() => { if (active) setOfficeLoading(false); });

    return () => { active = false; };
  }, [data, ext, isOffice, isBrowserOoxml, hasOfficeRenderFailure, officeRenderFailure]);

  const table = useMemo(() => ['csv', 'tsv'].includes(ext) ? rowsFrom(text, ext === 'tsv' ? '\t' : ',') : [], [ext, text]);
  const signals = useMemo(() => ext === 'vcd' ? [...text.matchAll(/^\s*\$var\s+\S+\s+(\d+)\s+(\S+)\s+(.+?)\s+\$end/gm)].slice(0, 500) : [], [ext, text]);
  const zoomIn = () => setZoom((value) => Math.min(3, Math.round((value + 0.1) * 100) / 100));
  const zoomOut = () => setZoom((value) => Math.max(0.4, Math.round((value - 0.1) * 100) / 100));
  const handleZoomKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomIn(); }
    else if (event.key === '-') { event.preventDefault(); zoomOut(); }
    else if (event.key === '0') { event.preventDefault(); setZoom(1); }
  };
  const controls = <div className="viewer-zoom-controls" role="toolbar" aria-label="Viewer zoom controls">
    <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out (Ctrl+-)" onClick={zoomOut} disabled={zoom <= 0.4}><ZoomOut size={15} /></button>
    <span aria-live="polite">{Math.round(zoom * 100)}%</span>
    <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in (Ctrl+=)" onClick={zoomIn} disabled={zoom >= 3}><ZoomIn size={15} /></button>
    <button type="button" className="icon-button" aria-label="Reset zoom" title="Reset zoom (Ctrl+0)" onClick={() => setZoom(1)} disabled={zoom === 1}><RotateCcw size={13} /></button>
  </div>;

  if (isImage) return <div className="file-viewer image-viewer" tabIndex={0} onKeyDown={handleZoomKeys}>
    {controls}
    <div className="image-viewer-viewport"><div className="image-viewer-content" style={{ width: `${zoom * 100}%` }}>
      {url ? <img src={url} alt={fileName} /> : <div className="loading-state">Loading image…</div>}
    </div></div>
  </div>;
  if (error) return <div className="unsupported-file"><h2>Preview unavailable</h2><p>{error}</p></div>;
  if (isOffice) return <div className="file-viewer office-viewer" tabIndex={0}>
    {officePdf
      ? <PdfReader data={officePdf} title={fileName} tabId={`office-preview-${fileName}`} />
      : isBrowserOoxml && !hasOfficeRenderFailure
        ? <>
            <div className="office-viewer-toolbar">
              <div><span>Read-only {ext.startsWith('ppt') ? 'presentation' : ext.startsWith('xls') ? 'workbook' : 'document'} preview</span><span>Rendered locally · No document upload</span></div>
            </div>
            {data instanceof Blob
              ? <OfficeOoxmlViewer key={`${fileName}-${ext}`} data={data} extension={ext} onError={handleOfficeRenderError} />
              : <div className="unsupported-file"><h2>Office preview unavailable</h2><p>The Office document data is unavailable.</p></div>}
          </>
        : officeLoading
          ? <div className="loading-state">Converting Office document to PDF…</div>
          : <div className="unsupported-file"><h2>Office preview unavailable</h2><p>{officeError || 'The Office document could not be rendered.'}</p></div>}
  </div>;
  if (ext === 'csv' || ext === 'tsv') return <div className="file-viewer table-viewer" tabIndex={0} onKeyDown={handleZoomKeys}>
    {controls}<div className="viewer-meta">Read-only table · first 200 rows / 30 columns</div>
    <div className="viewer-table-scroll"><div className="viewer-zoom-content" style={{ zoom }}><table><tbody>{table.map((r, i) => <tr key={i}>{r.map((v, j) => i === 0 ? <th key={j}>{v}</th> : <td key={j}>{v}</td>)}</tr>)}</tbody></table></div></div>
  </div>;
  if (ext === 'vcd') return <div className="file-viewer engineering-viewer" tabIndex={0} onKeyDown={handleZoomKeys}>
    {controls}<div className="viewer-zoom-content" style={{ zoom }}>
      <h2>VCD waveform inspection</h2>
      <div className="viewer-stat-grid"><span><b>{signals.length}</b> signal declarations</span><span><b>{(text.match(/(?:^|\n)\s*(?:[01xz][^\s]+|b[01xz]+\s+\S+)/gm) ?? []).length.toLocaleString()}</b> detected value changes</span><span><b>{text.match(/\$timescale\s+(.+?)\s+\$end/)?.[1] ?? 'Unknown'}</b> timescale</span></div>
      <div className="viewer-table-scroll"><table><thead><tr><th>Identifier</th><th>Width</th><th>Signal</th></tr></thead><tbody>{signals.map((v, i) => <tr key={i}><td>{v[2]}</td><td>{v[1]}</td><td>{v[3]}</td></tr>)}</tbody></table></div>
      <p className="viewer-note">Signal metadata is shown here. Interactive timing traces are not part of this initial viewer.</p>
    </div>
  </div>;
  if (['fst', 'gds', 'gdsii', 'kicad_pcb'].includes(ext)) return <div className="unsupported-file"><h2>{ext.toUpperCase()} renderer not installed</h2><p>{['doc', 'ppt'].includes(ext) ? 'Legacy binary Office files are not supported. Convert this file to DOCX or PPTX to preview and copy its text.' : 'This format is recognized, but its dedicated renderer is not bundled yet. The original file remains stored unchanged.'}</p><span>Read-only · {mimeType}</span></div>;
  return <div className="file-viewer source-viewer" tabIndex={0} onKeyDown={handleZoomKeys}>
    {controls}<div className="viewer-meta">Read-only source preview · {mimeType}</div>
    <pre style={{ zoom }}>{text || 'No text content.'}</pre>
  </div>;
}
