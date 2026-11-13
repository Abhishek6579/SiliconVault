/** Keyboard events expose the platform's primary shortcut key as Ctrl or Meta. */
export function isModKey(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'> | Pick<WheelEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey;
}
