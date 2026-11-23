import { useState, type PointerEvent, type TransitionEvent } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { Toast } from '../../hooks/use-notification';

interface ShownToast {
  readonly toast: Toast;
  readonly overSheet: boolean;
}

/** One live region. The last message stays rendered until its card has faded out. */
export function NotificationToast({
  toast,
  overSheet,
  onDismiss,
  onPause,
  onResume,
}: {
  toast: Toast | null;
  overSheet: boolean;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const [shown, setShown] = useState<ShownToast | null>(null);
  // A toast moves aside when a sheet opens, but never jumps back while a sheet closes.
  const sameToast = toast !== null && toast.id === shown?.toast.id;
  const placeOverSheet = overSheet || (sameToast && shown.overSheet);
  if (toast && (!sameToast || placeOverSheet !== shown.overSheet)) {
    setShown({ toast, overSheet: placeOverSheet });
  }
  const open = toast !== null;

  function finishExit(event: TransitionEvent<HTMLDivElement>) {
    if (open || event.target !== event.currentTarget || event.propertyName !== 'opacity') return;
    setShown(null);
  }
  function hold(event: PointerEvent<HTMLDivElement>, entering: boolean) {
    if (event.pointerType !== 'mouse') return;
    if (entering) onPause();
    else onResume();
  }

  return (
    <div
      className="toast-region"
      data-placement={shown?.overSheet ? 'sheet' : 'page'}
      data-toast-region=""
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="toast"
        data-state={open ? 'open' : 'closed'}
        onTransitionEnd={finishExit}
        onPointerEnter={(event) => hold(event, true)}
        onPointerLeave={(event) => hold(event, false)}
        onFocus={onPause}
        onBlur={onResume}
      >
        {shown && (
          <div className="toast-body" key={shown.toast.id}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{shown.toast.message}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss notification"
              // A pointer press must not pull focus out of an open sheet.
              onMouseDown={(event) => event.preventDefault()}
              onClick={onDismiss}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
