import { describe, expect, it } from 'vitest';
import { readDragPayload, WORKBENCH_DRAG_TYPE, writeDragPayload } from '../src/shared/utils/dragPayload';

describe('workbench drag payload', () => {
  it('round trips file and folder payloads', () => {
    const values = new Map<string, string>();
    const transfer = {
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? '',
    };
    writeDragPayload(transfer, { id: 'folder-1', type: 'folder' });
    expect(values.has(WORKBENCH_DRAG_TYPE)).toBe(true);
    expect(readDragPayload(transfer)).toEqual({ id: 'folder-1', type: 'folder' });
  });

  it('ignores absent and malformed payload shapes', () => {
    expect(readDragPayload({ getData: () => '' })).toBeNull();
    expect(readDragPayload({ getData: () => JSON.stringify({ id: 'x', type: 'project' }) })).toBeNull();
    expect(() => readDragPayload({ getData: () => '{' })).toThrow();
  });
});
