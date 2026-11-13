import type { FileMeta } from './types';

interface ExportRequest {
  id: number;
  meta: FileMeta;
  data: Blob | string;
  includeSerialized: boolean;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ExportRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
  }
  return btoa(parts.join(''));
}

workerScope.onmessage = async (event: MessageEvent<ExportRequest>) => {
  const { id, meta, data, includeSerialized } = event.data;
  try {
    const isText = typeof data === 'string';
    const bytes = isText ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength !== meta.size) {
      throw new Error(`File size metadata is inconsistent for "${meta.name}". Save or re-import the file before creating a backup.`);
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const item = {
      meta,
      content: { encoding: isText ? 'text' : 'base64', value: isText ? data : bytesToBase64(bytes) },
      sha256,
    };
    const serialized = JSON.stringify(item);
    const serializedBytes = new TextEncoder().encode(serialized);
    if (includeSerialized) {
      const transferable = serializedBytes.buffer as ArrayBuffer;
      workerScope.postMessage({ id, ok: true, byteLength: serializedBytes.byteLength, serializedBytes: transferable }, [transferable]);
    } else {
      workerScope.postMessage({ id, ok: true, byteLength: serializedBytes.byteLength });
    }
  } catch (error) {
    workerScope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Could not encode a backup file.' });
  }
};
