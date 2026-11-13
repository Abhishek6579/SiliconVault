import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { SearchCursor } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';
import type { EditorViewState } from '../../tabs/types';
export { normalizeMarkdownMath } from './markdownUtils';

const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

interface WorkspaceEditorProps {
  kind: 'code' | 'text' | 'markdown';
  name: string;
  tabId: string;
  value: string;
  fontSize: number;
  preview?: boolean;
  editorState?: EditorViewState;
  editorViewRef?: { current: EditorView | null };
  onChange: (value: string) => void;
  onViewStateChange: (view: EditorView, preview: boolean) => void;
}

function restoreEditorViewState(view: EditorView, state?: EditorViewState) {
  if (!state) return;
  const length = view.state.doc.length;
  view.dispatch({ selection: { anchor: Math.min(state.anchor, length), head: Math.min(state.head, length) } });
  view.scrollDOM.scrollTop = state.scrollTop;
  view.scrollDOM.scrollLeft = state.scrollLeft;
}

export default function WorkspaceEditor({
  kind, name, tabId, value, fontSize, preview = false, editorState, editorViewRef, onChange, onViewStateChange,
}: WorkspaceEditorProps) {
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const findInputRef = useRef<HTMLInputElement>(null);
  const findPositionRef = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewOffsetRef = useRef({ query: '', offset: -1 });
  const findInPreview = useCallback((query: string, direction: 1 | -1 = 1) => {
    const root = previewRef.current;
    const needle = query.trim().toLocaleLowerCase();
    const css = window.CSS as typeof CSS & { highlights?: { set: (name: string, value: unknown) => void; delete: (name: string) => void } };
    const HighlightConstructor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!root || !needle) { css.highlights?.delete('siliconvault-find'); previewOffsetRef.current = { query: '', offset: -1 }; return; }
    const segments: Array<{ node: Text; start: number; end: number }> = [];
    let combined = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const node = current as Text;
      const value = node.textContent ?? '';
      if (value) { segments.push({ node, start: combined.length, end: combined.length + value.length }); combined += value; }
      current = walker.nextNode();
    }
    const searchable = combined.toLocaleLowerCase();
    if (previewOffsetRef.current.query !== needle) previewOffsetRef.current = { query: needle, offset: -1 };
    const cursorOffset = previewOffsetRef.current.offset;
    let offset: number;
    if (direction > 0) {
      offset = searchable.indexOf(needle, cursorOffset + 1);
      if (offset < 0) offset = searchable.indexOf(needle);
    } else {
      offset = cursorOffset < 0 ? -1 : searchable.lastIndexOf(needle, cursorOffset - 1);
      if (offset < 0) offset = searchable.lastIndexOf(needle);
    }
    if (offset < 0) return;
    const locate = (position: number) => segments.find(segment => position >= segment.start && position < segment.end);
    const start = locate(offset), end = locate(offset + needle.length - 1);
    if (!start || !end) return;
    const range = document.createRange();
    range.setStart(start.node, offset - start.start);
    range.setEnd(end.node, offset + needle.length - end.start);
    if (css.highlights && HighlightConstructor) css.highlights.set('siliconvault-find', new HighlightConstructor(range));
    end.node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    previewOffsetRef.current = { query: needle, offset };
  }, []);

  const findInEditor = useCallback((query: string, direction: 1 | -1 = 1, restart = false) => {
    const view = editorViewRef?.current;
    const needle = query.trim();
    if (preview && kind === 'markdown') { findInPreview(query, direction); return; }
    if (!view || !view.dom.isConnected || !needle) return;
    if (restart) findPositionRef.current = 0;
    let result: ReturnType<SearchCursor['next']> | undefined;
    if (direction > 0) {
      const start = Math.min(view.state.doc.length, findPositionRef.current);
      result = new SearchCursor(view.state.doc, needle, start, undefined).next();
      if (result.done && start > 0) {
        result = new SearchCursor(view.state.doc, needle, 0, start).next();
      }
    } else {
      // Search the full document and retain the last match strictly before
      // the current match. If none exists (including the first match at 0),
      // wrap to the final occurrence.
      const cursor = new SearchCursor(view.state.doc, needle, 0, view.state.doc.length);
      let candidate: ReturnType<SearchCursor['next']> | undefined;
      let last: ReturnType<SearchCursor['next']> | undefined;
      let current = cursor.next();
      while (!current.done) {
        last = current;
        if (current.value.from < findPositionRef.current) candidate = current;
        current = cursor.next();
      }
      result = candidate ?? last;
    }
    if (!result || result.done) return;
    const match = result.value;
    findPositionRef.current = direction > 0 ? match.to : match.from;
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: EditorView.scrollIntoView(match.from, { y: 'center' }),
    });
    // Deliberately do not focus the editor: typing must remain in the find field.
  }, [editorViewRef, findInPreview, kind, preview]);

  useEffect(() => {
    const openFind = (event: Event) => {
      const requestedTabId = (event as CustomEvent<{ tabId?: string }>).detail?.tabId;
      if (requestedTabId && requestedTabId !== tabId) return;
      setFindOpen(true);
      window.setTimeout(() => findInputRef.current?.focus(), 0);
    };
    window.addEventListener('siliconvault:open-editor-search', openFind);
    return () => window.removeEventListener('siliconvault:open-editor-search', openFind);
  }, [tabId]);

  useEffect(() => {
    if (findOpen && findQuery.trim()) findInEditor(findQuery, 1, true);
  }, [findQuery, findOpen, findInEditor]);

  const findBar = findOpen && <div className="editor-find-bar">
    <span className="editor-find-label">Find</span>
    <input
      ref={findInputRef}
      aria-label="Find in file"
      placeholder="Find in code or text"
      value={findQuery}
      onChange={(event) => { setFindQuery(event.target.value); findPositionRef.current = 0; }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); findInEditor(findQuery, event.shiftKey ? -1 : 1); }
        if (event.key === 'Escape') { event.preventDefault(); setFindOpen(false); }
      }}
    />
    <button type="button" className="icon-button" aria-label="Previous match" title="Previous match" onClick={() => findInEditor(findQuery, -1)}><span>↑</span></button>
    <button type="button" className="icon-button" aria-label="Next match" title="Next match" onClick={() => findInEditor(findQuery, 1)}><span>↓</span></button>
    <button type="button" className="icon-button" aria-label="Close find" title="Close find" onClick={() => setFindOpen(false)}>×</button>
  </div>;

  const editorTheme = useMemo(() => EditorView.theme({
    '&': { height: '100%', backgroundColor: '#111111', color: '#e6e6e6' },
    '.cm-scroller': { fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace", lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { caretColor: '#f2f2f2', fontSize: `${fontSize}px` },
    '.cm-line': { padding: '0 4px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#f2f2f2' },
    '.cm-gutters': { backgroundColor: '#111111', color: '#777777', border: 'none', borderRight: '1px solid #242424', fontSize: `${fontSize}px` },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3.5em', padding: '0 12px 0 10px' },
    '.cm-activeLine': { backgroundColor: '#191919' },
    '.cm-activeLineGutter': { backgroundColor: '#191919', color: '#d8d8d8' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#343b4a' },
    '.cm-selectionMatch': { backgroundColor: '#292f3a' },
    '.cm-focused .cm-matchingBracket': { backgroundColor: '#292f3a', outline: '1px solid #59677f' },
    '.cm-searchMatch': { backgroundColor: '#51421f', outline: '1px solid #8a7134' },
    '.cm-searchMatch-selected': { backgroundColor: '#6a5526' },
    '.cm-tooltip': { backgroundColor: '#1b1b1b', color: '#e6e6e6', border: '1px solid #383838' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#30343d', color: '#ffffff' },
    '.cm-foldPlaceholder': { backgroundColor: '#292929', color: '#c7c7c7', border: 'none' },
  }, { dark: true }), [fontSize]);
  const editorSyntax = useMemo(() => syntaxHighlighting(HighlightStyle.define([
    { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
    { tag: tags.keyword, color: '#c586c0' },
    { tag: [tags.typeName, tags.className], color: '#4ec9b0' },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#dcdcaa' },
    { tag: [tags.string, tags.regexp, tags.special(tags.string)], color: '#ce9178' },
    { tag: [tags.number, tags.bool, tags.null], color: '#b5cea8' },
    { tag: tags.operator, color: '#d4d4d4' },
  ])), []);

  if (kind === 'markdown') {
    return <div className={"note-layout " + (preview ? "preview-only" : "")}>
      {!preview && <div className="code-editor markdown-editor">{findBar}<CodeMirror
        value={value} height="100%" theme={editorTheme} extensions={[markdown(), editorSyntax]}
        onChange={onChange}
        onCreateEditor={(view) => { if (editorViewRef) editorViewRef.current = view; restoreEditorViewState(view, editorState); }}
        onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) onViewStateChange(update.view, preview); }}
        basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true }}
      /></div>}
      <Suspense fallback={<div className="loading-state">Loading Markdown preview…</div>}>
        <MarkdownPreview value={value} fontSize={fontSize} preview={preview} findBar={findBar as ReactNode} previewRef={previewRef} />
      </Suspense>
    </div>;
  }

  const extension = kind === 'code'
    ? (['v', 'sv', 'vh', 'svh'].includes(name.split('.').pop()?.toLowerCase() ?? '')
      ? StreamLanguage.define(verilog)
      : javascript())
    : [];
  return <div className="code-editor">{findBar}<CodeMirror
    value={value} height="100%" theme={editorTheme} extensions={[extension, editorSyntax]}
    onChange={onChange}
    onCreateEditor={(view) => { if (editorViewRef) editorViewRef.current = view; restoreEditorViewState(view, editorState); }}
    onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) onViewStateChange(update.view, preview); }}
    basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true, closeBrackets: true }}
  /></div>;
}
