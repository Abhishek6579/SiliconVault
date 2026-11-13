import { useEffect, type RefObject } from 'react';

export function useClickOutside<T extends HTMLElement>(ref: RefObject<T | null>, onClose: () => void) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !ref.current?.contains(target)) onClose();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose, ref]);
}
