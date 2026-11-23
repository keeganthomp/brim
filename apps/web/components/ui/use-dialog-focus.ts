import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Lazy sheets have no Radix trigger, so remember the control that opened them on every open. */
export function useDialogFocus(
  open: boolean,
  field: RefObject<HTMLInputElement | null>,
  selectText = false,
) {
  const trigger = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // Layout effects run before Radix moves focus into the sheet.
    if (open && document.activeElement instanceof HTMLElement) {
      trigger.current = document.activeElement;
    }
  }, [open]);
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
    // Toasts float above sheets, so pressing one must not dismiss the sheet underneath.
    onPointerDownOutside(event: Event) {
      if (event.target instanceof Element && event.target.closest('[data-toast-region]')) {
        event.preventDefault();
      }
    },
  };
}
