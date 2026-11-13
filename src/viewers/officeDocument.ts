const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_XML_BYTES = 32 * 1024 * 1024;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  flags: number;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('This Office file is not a valid ZIP-based document.');
}

function readZipEntries(view: DataView, bytes: Uint8Array): ZipEntry[] {
  const end = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (centralOffset + centralSize > view.byteLength) throw new Error('The Office document archive is damaged.');

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('The Office document archive has an invalid directory.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset, flags });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(view: DataView, bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  if (entry.flags & 1) throw new Error('Encrypted Office documents are not supported.');
  if (entry.uncompressedSize > MAX_XML_BYTES) throw new Error('This Office document contains an XML part that is too large to preview.');
  const offset = entry.localOffset;
  if (offset + 30 > view.byteLength || view.getUint32(offset, true) !== LOCAL_SIGNATURE) {
    throw new Error('The Office document contains an invalid file entry.');
  }
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.byteLength) throw new Error('The Office document contains a truncated file entry.');
  const compressed = bytes.subarray(start, end);
  let content: Uint8Array;
  if (entry.method === 0) content = compressed;
  else if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This runtime cannot decompress Office documents.');
    // Copy into an owned ArrayBuffer: Uint8Array<ArrayBufferLike> is not a valid BlobPart
    // under newer TypeScript DOM typings because its backing store may be SharedArrayBuffer.
    const compressedBuffer = new ArrayBuffer(compressed.byteLength);
    new Uint8Array(compressedBuffer).set(compressed);
    const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_XML_BYTES) {
          await reader.cancel();
          throw new Error('This Office document contains an XML part that is too large to preview.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    content = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of chunks) { content.set(chunk, cursor); cursor += chunk.byteLength; }
  } else throw new Error(`Office compression method ${entry.method} is not supported.`);
  if (content.byteLength > MAX_XML_BYTES) throw new Error('This Office document contains an XML part that is too large to preview.');
  return new TextDecoder('utf-8').decode(content);
}

function xmlDocument(source: string): XMLDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Office XML containing document type or entity declarations is not supported.');
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('An Office document XML part could not be read.');
  return document;
}

function collectParagraphText(paragraph: Element): string {
  let result = '';
  const visit = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element.localName === 't') { result += element.textContent ?? ''; return; }
      if (element.localName === 'tab') { result += '\t'; return; }
      if (element.localName === 'br' || element.localName === 'cr') { result += '\n'; return; }
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(paragraph);
  return result;
}

function paragraphsFromXml(source: string, paragraphTag: string): string {
  const document = xmlDocument(source);
  return Array.from(document.getElementsByTagNameNS('*', paragraphTag))
    .map(collectParagraphText)
    .filter((paragraph) => paragraph.length > 0)
    .join('\n');
}

function slideNumber(name: string): number {
  return Number(name.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
}

export async function extractOfficeText(file: Blob, extension: string): Promise<string> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Office preview is limited to 100 MB per file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readZipEntries(view, bytes);

  if (extension === 'docx' || extension === 'docm') {
    const documentEntry = entries.find((entry) => entry.name === 'word/document.xml');
    if (!documentEntry) throw new Error('The Word document does not contain its main document body.');
    const text = paragraphsFromXml(await readZipEntry(view, bytes, documentEntry), 'p');
    return text || 'This document contains no extractable text.';
  }

  if (extension === 'pptx' || extension === 'pptm') {
    const slides = entries
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
      .sort((left, right) => slideNumber(left.name) - slideNumber(right.name));
    if (!slides.length) throw new Error('The PowerPoint file does not contain readable slides.');
    const text: string[] = [];
    for (let index = 0; index < slides.length; index += 1) {
      const slideXml = await readZipEntry(view, bytes, slides[index]);
      const slideText = paragraphsFromXml(slideXml, 'p');
      text.push(`Slide ${index + 1}\n${slideText || '(No extractable text)'}`);
    }
    return text.join('\n\n');
  }

  throw new Error('Only DOCX/DOCM and PPTX/PPTM Open XML files are supported. Convert legacy DOC/PPT files to the newer format to preview them.');
}


export interface OfficeRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  fontSize?: number;
  verticalAlign?: 'superscript' | 'subscript';
}

export interface OfficeBlock {
  type: 'paragraph' | 'table';
  text?: string;
  runs?: OfficeRun[];
  styleName?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  indentLeft?: number;
  indentFirstLine?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  rows?: OfficeBlock[][][];
}

function propertyEnabled(parent: Element | null, name: string): boolean {
  if (!parent) return false;
  const property = Array.from(parent.children).find((child) => child.localName === name);
  if (!property) return false;
  return property.getAttribute('val') !== '0' && property.getAttribute('val') !== 'false';
}

function parseOfficeRun(run: Element): OfficeRun {
  const properties = Array.from(run.children).find((child) => child.localName === 'rPr') ?? null;
  const color = properties && Array.from(properties.children).find((child) => child.localName === 'color')?.getAttribute('val');
  const highlight = properties && Array.from(properties.children).find((child) => child.localName === 'highlight')?.getAttribute('val');
  const size = properties && Array.from(properties.children).find((child) => child.localName === 'sz')?.getAttribute('val');
  const vertical = properties && Array.from(properties.children).find((child) => child.localName === 'vertAlign')?.getAttribute('val');
  return {
    text: collectParagraphText(run),
    bold: propertyEnabled(properties, 'b'),
    italic: propertyEnabled(properties, 'i'),
    underline: propertyEnabled(properties, 'u') && properties?.querySelector('u')?.getAttribute('val') !== 'none',
    strike: propertyEnabled(properties, 'strike') || propertyEnabled(properties, 'dstrike'),
    ...(color && color !== 'auto' ? { color: `#${color}` } : {}),
    ...(highlight && highlight !== 'none' ? { highlight: highlight === 'yellow' ? '#ffff00' : highlight } : {}),
    ...(size && Number.isFinite(Number(size)) ? { fontSize: Number(size) / 2 } : {}),
    ...(vertical === 'superscript' || vertical === 'subscript' ? { verticalAlign: vertical } : {}),
  };
}

function parseOfficeParagraph(paragraph: Element): OfficeBlock {
  const properties = Array.from(paragraph.children).find((child) => child.localName === 'pPr') ?? null;
  const styleName = properties && Array.from(properties.children).find((child) => child.localName === 'pStyle')?.getAttribute('val') ?? undefined;
  const alignmentValue = properties && Array.from(properties.children).find((child) => child.localName === 'jc')?.getAttribute('val');
  const indentation = properties && Array.from(properties.children).find((child) => child.localName === 'ind');
  const spacing = properties && Array.from(properties.children).find((child) => child.localName === 'spacing');
  const runs: OfficeRun[] = [];
  const collectRuns = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.localName === 'r') {
        const parsed = parseOfficeRun(child);
        if (parsed.text) runs.push(parsed);
      } else if (child.localName === 'hyperlink' || child.localName === 'sdt' || child.localName === 'smartTag') {
        collectRuns(child);
      }
    }
  };
  collectRuns(paragraph);
  const numbering = properties && Array.from(properties.children).find((child) => child.localName === 'numPr');
  if (numbering && runs.length) runs.unshift({ text: '• ' });
  const text = runs.map((run) => run.text).join('');
  return {
    type: 'paragraph',
    text,
    runs,
    ...(styleName ? { styleName } : {}),
    ...(alignmentValue === 'center' || alignmentValue === 'right' || alignmentValue === 'both'
      ? { alignment: alignmentValue === 'both' ? 'justify' as const : alignmentValue }
      : {}),
    ...(indentation?.getAttribute('left') ? { indentLeft: Number(indentation.getAttribute('left')) / 20 } : {}),
    ...(indentation?.getAttribute('firstLine') ? { indentFirstLine: Number(indentation.getAttribute('firstLine')) / 20 } : {}),
    ...(spacing?.getAttribute('before') ? { spaceBefore: Number(spacing.getAttribute('before')) / 20 } : {}),
    ...(spacing?.getAttribute('after') ? { spaceAfter: Number(spacing.getAttribute('after')) / 20 } : {}),
  };
}

function parseOfficeBlocks(parent: Element): OfficeBlock[] {
  const blocks: OfficeBlock[] = [];
  for (const child of Array.from(parent.children)) {
    if (child.localName === 'p') {
      const paragraph = parseOfficeParagraph(child);
      if (paragraph.text || paragraph.styleName) blocks.push(paragraph);
    } else if (child.localName === 'tbl') {
      const rows: OfficeBlock[][][] = [];
      for (const row of Array.from(child.children).filter((element) => element.localName === 'tr')) {
        const cells = Array.from(row.children).filter((element) => element.localName === 'tc')
          .map((cell) => parseOfficeBlocks(cell));
        rows.push(cells);
      }
      blocks.push({ type: 'table', rows });
    }
  }
  return blocks;
}

export function officeBlocksToText(blocks: OfficeBlock[]): string {
  return blocks.map((block) => block.type === 'paragraph'
    ? block.text ?? ''
    : (block.rows ?? []).map((row) => row.map((cell) => officeBlocksToText(cell)).join('\\t')).join('\\n')
  ).join('\\n');
}

export async function extractOfficeDocument(file: Blob, extension: string): Promise<OfficeBlock[]> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Office preview is limited to 100 MB per file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readZipEntries(view, bytes);

  if (extension === 'docx' || extension === 'docm') {
    const documentEntry = entries.find((entry) => entry.name === 'word/document.xml');
    if (!documentEntry) throw new Error('The Word document does not contain its main document body.');
    const xml = xmlDocument(await readZipEntry(view, bytes, documentEntry));
    const body = xml.getElementsByTagNameNS('*', 'body')[0];
    if (!body) throw new Error('The Word document body is empty or invalid.');
    const blocks = parseOfficeBlocks(body);
    return blocks.length ? blocks : [{ type: 'paragraph', text: 'This document contains no extractable text.', runs: [{ text: 'This document contains no extractable text.' }] }];
  }

  if (extension === 'pptx' || extension === 'pptm') {
    const slides = entries.filter((entry) => /^ppt\\/slides\\/slide\\d+\\.xml$/i.test(entry.name))
      .sort((left, right) => slideNumber(left.name) - slideNumber(right.name));
    if (!slides.length) throw new Error('The PowerPoint file does not contain readable slides.');
    const blocks: OfficeBlock[] = [];
    for (let index = 0; index < slides.length; index += 1) {
      const slideXml = await readZipEntry(view, bytes, slides[index]);
      const slideText = paragraphsFromXml(slideXml, 'p');
      blocks.push({ type: 'paragraph', styleName: 'Title', text: `Slide ${index + 1}`, runs: [{ text: `Slide ${index + 1}`, bold: true, fontSize: 20 }] });
      blocks.push(...slideText.split('\\n').filter(Boolean).map((line) => ({ type: 'paragraph' as const, text: line, runs: [{ text: line }] })));
    }
    return blocks;
  }
  throw new Error('Only DOCX/DOCM and PPTX/PPTM Open XML files are supported. Convert legacy DOC/PPT files to the newer format to preview them.');
}
