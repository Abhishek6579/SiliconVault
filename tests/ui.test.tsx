import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReadOnlyFileViewer, { rowsFrom } from '../src/viewers/ReadOnlyFileViewer';

describe('read-only viewer UI', () => {
  it('renders accessible zoom controls for image previews', () => {
    const markup = renderToStaticMarkup(createElement(ReadOnlyFileViewer, {
      fileName: 'diagram.png', mimeType: 'image/png', data: undefined,
    }));
    expect(markup).toContain('aria-label="Viewer zoom controls"');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('aria-label="Zoom out"');
    expect(markup).toContain('aria-label="Reset zoom"');
  });

  it('renders tabular previews with the read-only row and column limit', () => {
    const markup = renderToStaticMarkup(createElement(ReadOnlyFileViewer, {
      fileName: 'measurements.csv', mimeType: 'text/csv', data: 'time,value\n0,1\n1,2',
    }));
    expect(markup).toContain('Read-only table · first 200 rows / 30 columns');
    expect(markup).toContain('<table>');
    expect(rowsFrom('time,value\n0,1\n1,2', ',')).toEqual([['time', 'value'], ['0', '1'], ['1', '2']]);
  });

  it('renders the unsupported-format explanation instead of pretending to preview a binary format', () => {
    const markup = renderToStaticMarkup(createElement(ReadOnlyFileViewer, {
      fileName: 'layout.gds', mimeType: 'application/octet-stream', data: new Blob([new Uint8Array([1])]),
    }));
    expect(markup).toContain('GDS renderer not installed');
  });
});
