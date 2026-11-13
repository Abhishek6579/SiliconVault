import { useEffect, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  data: Blob;
  extension: string;
  onError: (error: Error) => void;
  zoom: number;
  onStateChange: (scale: number) => void;
}

interface ViewerHandle {
  load(source: ArrayBuffer): Promise<void>;
  destroy(): void;
  setScale(scale: number): void;
  getScale(): number;
}

const MAX_OFFICE_FILE_BYTES = 100 * 1024 * 1024;

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('The Office renderer could not open this document.');
}

export default function OfficeOoxmlViewer({ data, extension, onError, zoom, onStateChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(zoom);
  const viewerRef = useRef<ViewerHandle | null>(null);

  const changeScale = (next: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const bounded = Math.min(4, Math.max(0.1, Math.round(next * 100) / 100));
    viewer.setScale(bounded);
    setScale(viewer.getScale());
    onStateChange(viewer.getScale());
    onStateChange(viewer.getScale());
  };

  useEffect(() => {
    let active = true;
    let viewer: ViewerHandle | null = null;
    const host = hostRef.current;
    setLoading(true);
    setScale(zoom);
    viewerRef.current = null;

    const openDocument = async () => {
      if (!host) throw new Error('The Office preview container is unavailable.');
      if (data.size === 0) throw new Error('The Office document is empty.');
      if (data.size > MAX_OFFICE_FILE_BYTES) {
        throw new Error('Office previews are limited to 100 MB to protect memory usage.');
      }

      const source = await data.arrayBuffer();
      if (!active) return;

      // Keep parsing and (where supported) layout/painting away from the UI thread.
      // The library falls back to its main-thread renderer on WebViews without OffscreenCanvas.
      const mode = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
        ? 'worker'
        : 'main';

      if (extension === 'docx' || extension === 'docm') {
        const { DocxScrollViewer } = await import('@silurus/ooxml/docx');
        if (!active) return;
        viewer = new DocxScrollViewer(host, {
          mode,
          progressiveLayout: true,
          enableTextSelection: true,
          useGoogleFonts: false,
          onError: (reason: Error) => { if (active) onError(reason); },
          onScaleChange: (next: number) => { if (active) { setScale(next); onStateChange(next); } },
          onLayoutComplete: (reason?: unknown) => {
            if (active && reason) onError(asError(reason));
          },
        });
      } else if (extension === 'xlsx' || extension === 'xlsm') {
        const { XlsxViewer } = await import('@silurus/ooxml/xlsx');
        if (!active) return;
        viewer = new XlsxViewer(host, {
          mode,
          showZoomSlider: false,
          useGoogleFonts: false,
          onScaleChange: (next: number) => { if (active) setScale(next); },
          onError: (reason: Error) => { if (active) onError(reason); },
        });
      } else if (extension === 'pptx' || extension === 'pptm') {
        const { PptxScrollViewer } = await import('@silurus/ooxml/pptx');
        if (!active) return;
        viewer = new PptxScrollViewer(host, {
          mode,
          progressiveLayout: true,
          enableTextSelection: true,
          enableHyperlinks: false,
          useGoogleFonts: false,
          onError: (reason: Error) => { if (active) onError(reason); },
          onScaleChange: (next: number) => { if (active) setScale(next); },
          onLayoutComplete: (reason?: unknown) => {
            if (active && reason) onError(asError(reason));
          },
        });
      } else {
        throw new Error(`Unsupported browser Office format: .${extension}`);
      }

      viewerRef.current = viewer;
      await viewer.load(source);
      if (active) {
        setScale(viewer.getScale());
        setLoading(false);
      }
    };

    void openDocument().catch((reason: unknown) => {
      if (!active) return;
      setLoading(false);
      onError(asError(reason));
    });

    return () => {
      active = false;
      viewerRef.current = null;
      try {
        viewer?.destroy();
      } finally {
        host?.replaceChildren();
      }
    };
  }, [data, extension, onError]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (Math.abs(viewer.getScale() - zoom) > 0.005) {
      viewer.setScale(zoom);
      setScale(viewer.getScale());
    }
  }, [zoom]);

  return (
    <div className="office-ooxml-viewer">
      <div className="office-ooxml-toolbar" role="toolbar" aria-label="Document zoom controls">
        <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => changeScale(scale - 0.1)} disabled={scale <= 0.1}><ZoomOut size={15} /></button>
        <span aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => changeScale(scale + 0.1)} disabled={scale >= 4}><ZoomIn size={15} /></button>
        <button type="button" className="icon-button" aria-label="Reset zoom" title="Reset zoom" onClick={() => changeScale(1)} disabled={scale === 1}><RotateCcw size={13} /></button>
      </div>
      <div className="office-ooxml-host" data-viewer-scroll ref={hostRef} aria-label={`${extension.toUpperCase()} read-only preview`} />
      {loading && <div className="office-ooxml-loading" role="status">Rendering Office document…</div>}
    </div>
  );
}
