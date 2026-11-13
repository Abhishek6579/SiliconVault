import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Copy, Check } from 'lucide-react';
import { extractOfficeText } from './officeDocument';

interface Props { fileName: string; data?: Blob | string; mimeType: string; }

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
  const isOffice = ['docx', 'docm', 'pptx', 'pptm'].includes(ext);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [officeText, setOfficeText] = useState('');
  const [officeLoading, setOfficeLoading] = useState(false);
  const [officeError, setOfficeError] = useState('');
  const [copied, setCopied] = useState<'all' | 'selection' | null>(null);
  const [copyError, setCopyError] = useState('');
  const officeContentRef = useRef<HTMLPreElement>(null);

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
    setOfficeText('');
    setOfficeError('');
    setOfficeLoading(true);
    setCopied(null);
    if (!(data instanceof Blob)) {
      setOfficeError('The Office document data is unavailable.');
      setOfficeLoading(false);
      return;
    }
    extractOfficeText(data, ext)
      .then((value) => { if (active) setOfficeText(value); })
      .catch((reason: unknown) => { if (active) setOfficeError(reason instanceof Error ? reason.message : 'Could not read this Office document.'); })
      .finally(() => { if (active) setOfficeLoading(false); });
    return () => { active = false; };
  }, [data, ext, isOffice]);

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
  const copyOfficeText = async (selectionOnly: boolean) => {
    const selected = window.getSelection()?.toString().trim() ?? '';
    const selection = selected && officeContentRef.current?.contains(window.getSelection()?.anchorNode ?? null) ? selected : '';
    setCopyError('');
    if (selectionOnly && !selection) {
      setCopyError('Select text in the preview first, or use Copy all text.');
      return;
    }
    const value = selectionOnly ? selection : officeText;
    if (!value || officeLoading) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(selectionOnly && selection ? 'selection' : 'all');
    } catch {
      setCopyError('Clipboard access was blocked. Select the text and use Ctrl+C / Cmd+C instead.');
    }
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
  if (isOffice) return <div className="file-viewer office-viewer" tabIndex={0} onKeyDown={handleZoomKeys}>
    {controls}
    <div className="office-viewer-toolbar">
      <span>Read-only {ext.startsWith('ppt') ? 'slide text' : 'document text'} · Original file is unchanged</span>
      <div>
        <button type="button" className="office-copy-button" onClick={() => void copyOfficeText(true)} disabled={officeLoading || !officeText}><Copy size={13} /> {copied === 'selection' ? <><Check size={13} /> Copied selection</> : 'Copy selection'}</button>
        <button type="button" className="office-copy-button" onClick={() => void copyOfficeText(false)} disabled={officeLoading || !officeText}><Copy size={13} /> {copied === 'all' ? <><Check size={13} /> Copied all</> : 'Copy all text'}</button>
      </div>
      {copyError && <span role="status" className="office-copy-feedback">{copyError}</span>}
    </div>
    {officeLoading ? <div className="loading-state">Extracting document text…</div> : officeError ? <div className="unsupported-file"><h2>Office preview unavailable</h2><p>{officeError}</p></div> : <pre ref={officeContentRef} className="office-document-content" style={{ zoom }}>{officeText}</pre>}
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
  if (['doc', 'ppt', 'xlsx', 'fst', 'gds', 'gdsii', 'kicad_pcb'].includes(ext)) return <div className="unsupported-file"><h2>{ext.toUpperCase()} renderer not installed</h2><p>{['doc', 'ppt'].includes(ext) ? 'Legacy binary Office files are not supported. Convert this file to DOCX or PPTX to preview and copy its text.' : 'This format is recognized, but its dedicated renderer is not bundled yet. The original file remains stored unchanged.'}</p><span>Read-only · {mimeType}</span></div>;
  return <div className="file-viewer source-viewer" tabIndex={0} onKeyDown={handleZoomKeys}>
    {controls}<div className="viewer-meta">Read-only source preview · {mimeType}</div>
    <pre style={{ zoom }}>{text || 'No text content.'}</pre>
  </div>;
}
