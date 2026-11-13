import { useEffect, useRef, useState } from 'react';

interface Props {
  data: Blob;
  extension: string;
  onError: (error: Error) => void;
}

interface ViewerHandle {
  load(source: ArrayBuffer): Promise<void>;
  destroy(): void;
}

const MAX_OFFICE_FILE_BYTES = 100 * 1024 * 1024;

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('The Office renderer could not open this document.');
}

export default function OfficeOoxmlViewer({ data, extension, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let viewer: ViewerHandle | null = null;
    const host = hostRef.current;
    setLoading(true);

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
          onLayoutComplete: (reason?: unknown) => {
            if (active && reason) onError(asError(reason));
          },
        });
      } else if (extension === 'xlsx' || extension === 'xlsm') {
        const { XlsxViewer } = await import('@silurus/ooxml/xlsx');
        if (!active) return;
        viewer = new XlsxViewer(host, {
          mode,
          showZoomSlider: true,
          useGoogleFonts: false,
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
          onLayoutComplete: (reason?: unknown) => {
            if (active && reason) onError(asError(reason));
          },
        });
      } else {
        throw new Error(`Unsupported browser Office format: .${extension}`);
      }

      await viewer.load(source);
      if (active) setLoading(false);
    };

    void openDocument().catch((reason: unknown) => {
      if (!active) return;
      setLoading(false);
      onError(asError(reason));
    });

    return () => {
      active = false;
      try {
        viewer?.destroy();
      } finally {
        host?.replaceChildren();
      }
    };
  }, [data, extension, onError]);

  return (
    <div className="office-ooxml-viewer">
      <div className="office-ooxml-host" ref={hostRef} aria-label={`${extension.toUpperCase()} read-only preview`} />
      {loading && <div className="office-ooxml-loading" role="status">Rendering Office document…</div>}
    </div>
  );
}
