import { describe, expect, it } from 'vitest';
import { isModKey } from '../src/shared/keyboard/modifier';

describe('isModKey', () => {
  it('recognizes Ctrl on Windows and Linux keyboard events', () => {
    expect(isModKey({ ctrlKey: true, metaKey: false })).toBe(true);
  });

  it('recognizes Meta on macOS keyboard events', () => {
    expect(isModKey({ ctrlKey: false, metaKey: true })).toBe(true);
  });

  it('does not treat an unmodified event as a shortcut', () => {
    expect(isModKey({ ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('treats a trackpad pinch reported as ctrl+wheel as a zoom gesture', () => {
    expect(isModKey({ ctrlKey: true, metaKey: false })).toBe(true);
  });
});
