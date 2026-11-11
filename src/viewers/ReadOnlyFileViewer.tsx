import { useEffect, useMemo, useState } from 'react';
interface Props { fileName: string; data?: Blob | string; mimeType: string; }
function rowsFrom(source: string, delimiter: string): string[][] {
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
  const [text, setText] = useState(''); const [url, setUrl] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    setError(''); setText(''); setUrl('');
    if (!(data instanceof Blob)) { setText(typeof data === 'string' ? data : ''); return; }
    if (!isImage && !isTextPreview) return;
    if (isImage) { const objectUrl = URL.createObjectURL(data); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }
    let active = true;
    if (data.size > 24 * 1024 * 1024) { setError('Text preview is limited to 24 MB to protect memory usage.'); return; }
    data.text().then((value) => { if (active) setText(value); }).catch(() => { if (active) setError('Could not decode this file as text.'); });
    return () => { active = false; };
  }, [data, isImage, isTextPreview]);
  const table = useMemo(() => ['csv', 'tsv'].includes(ext) ? rowsFrom(text, ext === 'tsv' ? '\t' : ',') : [], [ext, text]);
  const signals = useMemo(() => ext === 'vcd' ? [...text.matchAll(/^\s*\$var\s+\S+\s+(\d+)\s+(\S+)\s+(.+?)\s+\$end/gm)].slice(0, 500) : [], [ext, text]);
  if (isImage) return <div className="file-viewer image-viewer">{url ? <img src={url} alt={fileName} /> : <div className="loading-state">Loading image…</div>}</div>;
  if (error) return <div className="unsupported-file"><h2>Preview unavailable</h2><p>{error}</p></div>;
  if (ext === 'csv' || ext === 'tsv') return <div className="file-viewer table-viewer"><div className="viewer-meta">Read-only table · first 200 rows / 30 columns</div><div className="viewer-table-scroll"><table><tbody>{table.map((r, i) => <tr key={i}>{r.map((v, j) => i === 0 ? <th key={j}>{v}</th> : <td key={j}>{v}</td>)}</tr>)}</tbody></table></div></div>;
  if (ext === 'vcd') return <div className="file-viewer engineering-viewer"><h2>VCD waveform inspection</h2><div className="viewer-stat-grid"><span><b>{signals.length}</b> signal declarations</span><span><b>{(text.match(/(?:^|\n)\s*(?:[01xz][^\s]+|b[01xz]+\s+\S+)/gm) ?? []).length.toLocaleString()}</b> detected value changes</span><span><b>{text.match(/\$timescale\s+(.+?)\s+\$end/)?.[1] ?? 'Unknown'}</b> timescale</span></div><div className="viewer-table-scroll"><table><thead><tr><th>Identifier</th><th>Width</th><th>Signal</th></tr></thead><tbody>{signals.map((v, i) => <tr key={i}><td>{v[2]}</td><td>{v[1]}</td><td>{v[3]}</td></tr>)}</tbody></table></div><p className="viewer-note">Signal metadata is shown here. Interactive timing traces are not part of this initial viewer.</p></div>;
  if (['doc', 'docx', 'pptx', 'xlsx', 'fst', 'gds', 'gdsii', 'kicad_pcb'].includes(ext)) return <div className="unsupported-file"><h2>{ext.toUpperCase()} renderer not installed</h2><p>This format is recognized, but its dedicated binary/document renderer is not bundled yet. The original file remains stored unchanged.</p><span>Read-only · {mimeType}</span></div>;
  return <div className="file-viewer source-viewer"><div className="viewer-meta">Read-only source preview · {mimeType}</div><pre>{text || 'No text content.'}</pre></div>;
}
