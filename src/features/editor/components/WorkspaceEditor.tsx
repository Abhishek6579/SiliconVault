import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { EditorViewState } from '../../tabs/types';
import MermaidDiagram from '../../../components/MermaidDiagram';

interface WorkspaceEditorProps {
  kind: 'code' | 'text' | 'markdown';
  name: string;
  value: string;
  fontSize: number;
  preview?: boolean;
  editorState?: EditorViewState;
  editorViewRef?: { current: EditorView | null };
  onChange: (value: string) => void;
  onViewStateChange: (view: EditorView, preview: boolean) => void;
}

// Accept Markdown's $...$ syntax and common LaTeX \(...\) / \[...\] delimiters.
// The conversion affects preview rendering only; the original Markdown remains unchanged.
export function normalizeMarkdownMath(source: string): string {
  const normalized = source
    .replace(/\\{1,2}\(/g, () => '$')
    .replace(/\\{1,2}\)/g, () => '$')
    .replace(/\\{1,2}\[/g, () => '$$')
    .replace(/\\{1,2}\]/g, () => '$$');
  return normalized.replace(/(\${1,2})([\s\S]*?)\1/g, (_match, delimiter: string, expression: string) =>
    delimiter + expression.replace(/\\_/g, '_') + delimiter,
  );
}

function restoreEditorViewState(view: EditorView, state?: EditorViewState) {
  if (!state) return;
  const length = view.state.doc.length;
  view.dispatch({ selection: { anchor: Math.min(state.anchor, length), head: Math.min(state.head, length) } });
  view.scrollDOM.scrollTop = state.scrollTop;
  view.scrollDOM.scrollLeft = state.scrollLeft;
}

export default function WorkspaceEditor({
  kind, name, value, fontSize, preview = false, editorState, editorViewRef, onChange, onViewStateChange,
}: WorkspaceEditorProps) {
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
    return <div className={`note-layout ${preview ? 'preview-only' : ''}`}>
      {!preview && <div className="code-editor markdown-editor"><CodeMirror
        value={value} height="100%" theme={editorTheme} extensions={[markdown(), editorSyntax]}
        onChange={onChange}
        onCreateEditor={(view) => { if (editorViewRef) editorViewRef.current = view; restoreEditorViewState(view, editorState); }}
        onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) onViewStateChange(update.view, preview); }}
        basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true }}
      /></div>}
      <div className="markdown-preview"><div className="preview-label">PREVIEW</div><article className="prose" style={{ fontSize: `${fontSize}px` }}><ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}
        components={{ code({ className, children, ...props }) {
          const code = String(children).replace(/\n$/, '');
          if (className === 'language-mermaid') return <MermaidDiagram source={code} />;
          return <code className={className} {...props}>{children}</code>;
        } }}
      >{normalizeMarkdownMath(value)}</ReactMarkdown></article></div>
    </div>;
  }

  const extension = kind === 'code'
    ? (['v', 'sv', 'vh', 'svh'].includes(name.split('.').pop()?.toLowerCase() ?? '')
      ? StreamLanguage.define(verilog)
      : javascript())
    : [];
  return <div className="code-editor"><CodeMirror
    value={value} height="100%" theme={editorTheme} extensions={[extension, editorSyntax]}
    onChange={onChange}
    onCreateEditor={(view) => { if (editorViewRef) editorViewRef.current = view; restoreEditorViewState(view, editorState); }}
    onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) onViewStateChange(update.view, preview); }}
    basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true, closeBrackets: true }}
  /></div>;
}
