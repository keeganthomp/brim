import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FlaskConical, LoaderCircle, LockKeyhole, Wallet, X } from 'lucide-react';
import { dollars, paymentDollars } from '../../lib/currency';
import { parseLiveTransfer } from '../../lib/funds';
import type { FundsController } from '../../hooks/use-funds';
import { useHeldWhileClosed, useRetained } from '../../hooks/use-exit-state';
import { useDialogFocus } from '../ui/use-dialog-focus';

export function FundsDialog({
  controller,
  balance: liveBalance,
}: {
  controller: FundsController;
  balance: number;
}) {
  const {
    mode: openMode,
    amount,
    error,
    close,
    submit,
    editAmount,
    addKey,
    workspaceMode,
    busy,
  } = controller;
  const open = openMode !== null;
  const mode = useRetained(openMode);
  const shownWorkspace = useHeldWhileClosed(workspaceMode, open);
  const shownBusy = useHeldWhileClosed(busy, open);
  const demo = shownWorkspace === 'demo';
  const balance = useHeldWhileClosed(liveBalance, open);
  const amountField = useRef<HTMLInputElement>(null);
  const focus = useDialogFocus(open, amountField, true);
  const value = Number(amount);
  const validAmount = demo
    ? /^\d+(\.\d{1,2})?$/.test(amount) && value > 0 && value <= 1_000_000
    : parseLiveTransfer(amount) !== undefined;
  const displayAmount = demo ? dollars : paymentDollars;
  const preview =
    validAmount && (mode !== 'withdraw' || value <= balance)
      ? balance + (mode === 'deposit' ? value : -value)
      : null;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="funds-modal"
          aria-describedby="funds-description"
          inert={!open}
          {...focus}
        >
          <Dialog.Close className="icon-button modal-close" aria-label="Close funds dialog">
            <X size={20} />
          </Dialog.Close>
          <span className="funds-icon">
            <Wallet size={23} aria-hidden="true" />
          </span>
          <Dialog.Title>{mode === 'deposit' ? 'Add funds' : 'Withdraw funds'}</Dialog.Title>
          <Dialog.Description id="funds-description">
            {demo
              ? mode === 'deposit'
                ? 'To your demo treasury.'
                : 'From your demo treasury.'
              : mode === 'deposit'
                ? 'From your owner wallet to this vault.'
                : 'From this vault to your owner wallet.'}
          </Dialog.Description>
          <form onSubmit={submit} aria-busy={shownBusy}>
            <div className="amount-input" data-long={amount.length > 7}>
              <span>$</span>
              <input
                ref={amountField}
                aria-label="Amount in US dollars"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'funds-error funds-preview' : 'funds-preview'}
                value={amount}
                onChange={(e) => editAmount(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                disabled={shownBusy}
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
                  disabled={shownBusy}
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
              {demo ? (
                <FlaskConical size={15} aria-hidden="true" />
              ) : (
                <LockKeyhole size={15} aria-hidden="true" />
              )}
              <span>{demo ? 'Demo balance' : 'Vault balance'}</span>
              <strong className="mono">{displayAmount(balance)}</strong>
            </div>
            <p className="funds-preview" id="funds-preview" aria-live="polite" aria-atomic="true">
              <span>Balance after {mode === 'deposit' ? 'deposit' : 'withdrawal'}</span>
              <strong className="mono">{preview === null ? '—' : displayAmount(preview)}</strong>
            </p>
            {error && (
              <p className="form-error" id="funds-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" type="submit" disabled={shownBusy}>
              {shownBusy && (
                <LoaderCircle size={15} className="busy-indicator" aria-hidden="true" />
              )}
              {shownBusy
                ? demo
                  ? 'Updating…'
                  : 'Check your wallet…'
                : demo
                  ? mode === 'deposit'
                    ? 'Add demo funds'
                    : 'Withdraw demo funds'
                  : 'Review in wallet'}
            </button>
            <p className="funds-disclaimer">
              <LockKeyhole size={12} aria-hidden="true" />
              {demo ? 'Demo only. No funds move.' : 'Review and approve in your owner wallet.'}
            </p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
