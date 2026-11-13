import type { ReactNode, RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import MermaidDiagram from '../../../components/MermaidDiagram';
import { normalizeMarkdownMath } from './markdownUtils';
import 'katex/dist/katex.min.css';

interface MarkdownPreviewProps {
  value: string;
  fontSize: number;
  preview: boolean;
  findBar: ReactNode;
  previewRef: RefObject<HTMLDivElement | null>;
}

export default function MarkdownPreview({ value, fontSize, preview, findBar, previewRef }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview" ref={preview ? previewRef : undefined}>
      {preview && findBar}
      <div className="preview-label">PREVIEW</div>
      <article className="prose" style={{ fontSize: fontSize + 'px' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            code({ className, children, ...props }) {
              const code = String(children).replace(/\n$/, '');
              if (className === 'language-mermaid') return <MermaidDiagram source={code} />;
              return <code className={className} {...props}>{children}</code>;
            },
          }}
        >
          {normalizeMarkdownMath(value)}
        </ReactMarkdown>
      </article>
    </div>
  );
}
