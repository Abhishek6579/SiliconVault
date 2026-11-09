
import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { oneDark } from '@codemirror/theme-one-dark';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

import {
  X,
  Save,
  Eye,
  Code2,
  Columns2,
  FileText,
  Tag,
  Folder,
  CircleDot
} from 'lucide-react';

import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import '../styles/AdvancedEditor.css';

const EMPTY_DOCUMENT = {
  title: '',
  kind: 'markdown',
  content: '',
  folderId: null,
  tags: []
};

export default function AdvancedEditor({
  document: initialDocument,
  folders = [],
  getFolderPath,
  onSave,
  onClose,
  embedded = false
}) {
  const [draft, setDraft] = useState(() => ({
    ...EMPTY_DOCUMENT,
    ...initialDocument,
    tags: initialDocument?.tags ?? []
  }));

  const [tagInput, setTagInput] = useState('');
  const [view, setView] = useState('split');
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      ...EMPTY_DOCUMENT,
      ...initialDocument,
      tags: initialDocument?.tags ?? []
    });
    setSaved(true);
  }, [initialDocument]);

  const isCode = ['verilog', 'systemverilog'].includes(draft.kind);

  const extensions = useMemo(() => {
    if (draft.kind === 'markdown') {
      return [markdown()];
    }

    if (isCode) {
      return [StreamLanguage.define(verilog)];
    }

    return [];
  }, [draft.kind, isCode]);

  function updateDraft(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function addTag(event) {
    event.preventDefault();

    const tag = tagInput.trim().replace(/^#/, '');
    if (!tag) return;

    if (!draft.tags.includes(tag)) {
      updateDraft('tags', [...draft.tags, tag]);
    }

    setTagInput('');
  }

  function removeTag(tagToRemove) {
    updateDraft(
      'tags',
      draft.tags.filter(tag => tag !== tagToRemove)
    );
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      window.alert('Enter a document title before saving.');
      return;
    }

    setSaving(true);

    try {
      const savedDocument = await onSave({
        ...draft,
        title: draft.title.trim(),
        updatedAt: new Date().toISOString()
      });

      if (savedDocument) {
        setDraft(savedDocument);
      }

      setSaved(true);
    } catch (error) {
      console.error('Document save failed:', error);
      window.alert('Could not save the document. Check the console.');
    } finally {
      setSaving(false);
    }
  }

  const languageLabel = {
    markdown: 'Markdown',
    verilog: 'Verilog',
    systemverilog: 'SystemVerilog',
    text: 'Plain text'
  }[draft.kind] ?? draft.kind;

  return (
    <div className={`advanced-editor-overlay ${embedded ? 'embedded' : ''}`}>
      <section className="advanced-editor">

        <header className="advanced-editor-header">
          <div className="editor-heading">
            <div className="editor-file-icon">
              {isCode ? <Code2 size={19} /> : <FileText size={19} />}
            </div>

            <div>
              <h2>{initialDocument?.id ? 'Edit document' : 'New document'}</h2>
              <p>{languageLabel} editor</p>
            </div>
          </div>

          <div className="editor-header-actions">
            <span className={`editor-save-status ${saved ? 'is-saved' : ''}`}>
              <CircleDot size={12} />
              {saved ? 'Saved' : 'Unsaved changes'}
            </span>

            <button
              className="editor-icon-button"
              onClick={onClose}
              aria-label="Close editor"
              title="Close"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="editor-metadata">
          <div className="editor-field editor-title-field">
            <label>Document title</label>
            <input
              value={draft.title}
              onChange={event => updateDraft('title', event.target.value)}
              placeholder="Untitled document"
            />
          </div>

          <div className="editor-field">
            <label><Folder size={13} /> Folder</label>
            <select value={draft.folderId ?? ''} onChange={event=>updateDraft('folderId',event.target.value?Number(event.target.value):null)}>
              <option value="">Unsorted</option>
              {folders.map(folder=><option key={folder.id} value={folder.id}>{getFolderPath?.(folder.id)||folder.name}</option>)}
            </select>
          </div>
        </div>

        <div className="editor-tags">
          <div className="editor-tags-label">
            <Tag size={14} />
            <span>Tags</span>
          </div>

          <div className="editor-tag-list">
            {draft.tags.map(tag => (
              <button
                type="button"
                className="editor-tag"
                key={tag}
                onClick={() => removeTag(tag)}
                title={`Remove ${tag}`}
              >
                #{tag} <X size={11} />
              </button>
            ))}

            <form onSubmit={addTag}>
              <input
                value={tagInput}
                onChange={event => setTagInput(event.target.value)}
                placeholder="Add tag and press Enter"
              />
            </form>
          </div>
        </div>

        <div className="editor-toolbar">
          <div className="editor-toolbar-left">
            <span className="editor-language">{languageLabel}</span>
            <span className="editor-toolbar-separator" />
            <span>{draft.content.length} characters</span>
          </div>

          {draft.kind === 'markdown' && (
            <div className="editor-view-controls">
              <button
                className={view === 'edit' ? 'active' : ''}
                onClick={() => setView('edit')}
                title="Editor only"
              >
                <Code2 size={15} />
                Edit
              </button>

              <button
                className={view === 'split' ? 'active' : ''}
                onClick={() => setView('split')}
                title="Split view"
              >
                <Columns2 size={15} />
                Split
              </button>

              <button
                className={view === 'preview' ? 'active' : ''}
                onClick={() => setView('preview')}
                title="Preview only"
              >
                <Eye size={15} />
                Preview
              </button>
            </div>
          )}
        </div>

        <div className={`editor-workspace editor-view-${view}`}>
          {(view !== 'preview' || isCode) && (
            <div className="editor-pane">
              <div className="editor-pane-heading">
                <Code2 size={14} />
                Source
              </div>

              <CodeMirror
                value={draft.content ?? ''}
                height="100%"
                theme={oneDark}
                extensions={extensions}
                onChange={value => updateDraft('content', value)}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  bracketMatching: true,
                  autocompletion: true,
                  tabSize: 2
                }}
              />
            </div>
          )}

          {draft.kind === 'markdown' && view !== 'edit' && (
            <div className="editor-preview-pane">
              <div className="editor-pane-heading">
                <Eye size={14} />
                Live preview
              </div>

              <article className="markdown-preview">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {draft.content || '*Nothing to preview yet.*'}
                </ReactMarkdown>
              </article>
            </div>
          )}

          {isCode && (
            <div className="editor-code-info">
              <Code2 size={15} />
              <span>
                Code preview is shown in the source editor. A dedicated
                HDL simulation and waveform workflow can be added separately.
              </span>
            </div>
          )}
        </div>

        <footer className="advanced-editor-footer">
          <span>
            <CircleDot size={12} />
            Stored locally in this browser
          </span>

          <div>
            <button className="editor-cancel-button" onClick={onClose}>
              Cancel
            </button>

            <button
              className="editor-save-button"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={15} />
              {saving ? 'Saving...' : 'Save document'}
            </button>
          </div>
        </footer>

      </section>
    </div>
  );
}
