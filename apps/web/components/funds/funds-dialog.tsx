import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FlaskConical, LockKeyhole, Wallet, X } from 'lucide-react';
import { dollars } from '../../lib/currency';
import type { FundsController } from '../../hooks/use-funds';
import { useDialogFocus } from '../ui/use-dialog-focus';
export function FundsDialog({
  controller,
  balance,
}: {
  controller: FundsController;
  balance: number;
}) {
  const { mode, amount, error, close, submit, editAmount, addKey } = controller;
  const amountField = useRef<HTMLInputElement>(null);
  const focus = useDialogFocus(amountField, true);
  const value = Number(amount);
  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount) && value > 0 && value <= 1_000_000;
  const preview =
    validAmount && (mode !== 'withdraw' || value <= balance)
      ? balance + (mode === 'deposit' ? value : -value)
      : null;
  return (
    <Dialog.Root
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="funds-modal" aria-describedby="funds-description" {...focus}>
          <Dialog.Close className="icon-button modal-close" aria-label="Close funds dialog">
            <X size={20} />
          </Dialog.Close>
          <span className="funds-icon">
            <Wallet size={23} aria-hidden="true" />
          </span>
          <Dialog.Title>{mode === 'deposit' ? 'Add funds' : 'Withdraw funds'}</Dialog.Title>
          <Dialog.Description id="funds-description">
            {mode === 'deposit' ? 'To your agent treasury.' : 'From your agent treasury.'}
          </Dialog.Description>
          <form onSubmit={submit}>
            <div className="amount-input" data-long={amount.length > 7}>
              <span>$</span>
              <input
                ref={amountField}
                aria-label="Amount in US dollars"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'funds-error funds-preview' : 'funds-preview'}
                value={amount}
                onChange={(e) => {
                  editAmount(e.target.value);
                }}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
              />
            </div>
            <span className="currency-pill">
              <span>$</span> USDC
            </span>
            <div className="keypad" role="group" aria-label="Amount keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => addKey(key)}
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse') event.preventDefault();
                  }}
                  aria-label={
                    key === 'back' ? 'Delete last digit' : key === '.' ? 'Decimal point' : key
                  }
                >
                  {key === 'back' ? <span className="keypad-delete">⌫</span> : key}
                </button>
              ))}
            </div>
            <div className="funds-wallet">
              <FlaskConical size={15} />
              <span>Demo balance</span>
              <strong className="mono">{dollars(balance)}</strong>
            </div>
            <p className="funds-preview" id="funds-preview" aria-live="polite" aria-atomic="true">
              <span>Balance after {mode === 'deposit' ? 'deposit' : 'withdrawal'}</span>
              <strong className="mono">{preview === null ? '—' : dollars(preview)}</strong>
            </p>
            {error && (
              <p className="form-error" id="funds-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" type="submit">
              {mode === 'deposit' ? 'Add demo funds' : 'Withdraw demo funds'}
            </button>
            <p className="funds-disclaimer">
              <LockKeyhole size={12} aria-hidden="true" /> Demo only. No funds move.
            </p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
