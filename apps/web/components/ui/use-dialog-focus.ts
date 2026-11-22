import { useRef, type RefObject } from 'react';

/** Lazy sheets do not have a Radix trigger, so preserve the invoking keyboard focus. */
export function useDialogFocus(field: RefObject<HTMLInputElement | null>, selectText = false) {
  const trigger = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return {
    onOpenAutoFocus(event: Event) {
      if (!field.current) return;
      event.preventDefault();
      field.current.focus({ preventScroll: true });
      if (selectText) field.current.select();
    },
    onCloseAutoFocus(event: Event) {
      if (!trigger.current?.isConnected || trigger.current === document.body) return;
      event.preventDefault();
      trigger.current.focus({ preventScroll: true });
    },
  };
}
