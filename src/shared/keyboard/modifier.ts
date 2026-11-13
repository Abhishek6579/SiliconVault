/** Keyboard events expose the platform's primary shortcut key as Ctrl or Meta.
 * Wheel events also use ctrlKey for trackpad pinch zoom in some desktop webviews.
 */
export function isModKey(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'> | Pick<WheelEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey;
}
