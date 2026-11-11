import { useEffect, useRef } from 'react';

interface MermaidDiagramProps {
  source: string;
}

/** Render a Mermaid diagram without allowing a stale async render to touch a newer component. */
export default function MermaidDiagram({ source }: MermaidDiagramProps) {
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const id = `diagram-${crypto.randomUUID()}`;

    import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
        return mermaid.render(id, source);
      })
      .then(({ svg }) => {
        if (alive && target.current) target.current.innerHTML = svg;
      })
      .catch(() => {
        if (alive && target.current) target.current.textContent = 'This diagram could not be rendered.';
      });

    return () => {
      alive = false;
    };
  }, [source]);

  return <div className="mermaid-diagram" ref={target} />;
}
