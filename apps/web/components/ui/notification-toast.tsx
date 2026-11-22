import { ShieldCheck, X } from 'lucide-react';
export function NotificationToast({ toast, onDismiss }: { toast: string; onDismiss: () => void }) {
  return (
    <div
      className={`toast ${toast ? 'visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {toast && (
        <>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{toast}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss()}
          >
            <X size={15} />
          </button>
        </>
      )}
    </div>
  );
}
