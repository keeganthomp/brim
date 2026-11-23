import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LoaderCircle, Snowflake, X } from 'lucide-react';
import type { AgentPolicyController } from '../../hooks/use-agent-policy';
import { AgentPolicyFields } from './agent-policy-fields';
import { useDialogFocus } from '../ui/use-dialog-focus';

export function AgentPolicyDrawer({ controller }: { controller: AgentPolicyController }) {
  const { draft, creating, mode, canEdit, canFreeze, busy, setDraft, saveAgent, freezeAgent } =
    controller;
  const firstField = useRef<HTMLInputElement>(null);
  const focus = useDialogFocus(firstField);
  const content = useRef<HTMLDivElement>(null);
  function focusFirstControl(event: Event) {
    event.preventDefault();
    // Let touch users read the sheet before opening their keyboard.
    if (!canEdit || window.matchMedia('(pointer: coarse)').matches) {
      content.current?.focus({ preventScroll: true });
      return;
    }
    const first = creating
      ? firstField.current
      : content.current?.querySelector<HTMLInputElement>('input[type="number"]');
    first?.focus({ preventScroll: true });
    if (!creating) first?.select();
  }
  const action = creating ? 'Add policy' : 'Save changes';
  const actionLabel =
    mode === 'live'
      ? 'Review in wallet'
      : mode === 'demo'
        ? creating
          ? 'Add demo policy'
          : 'Save demo policy'
        : action;
  const pendingLabel = mode === 'live' ? 'Check your wallet…' : 'Applying policy…';
  return (
    <Dialog.Root
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) setDraft(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={content}
          className="policy-drawer"
          aria-describedby="policy-description"
          {...focus}
          onOpenAutoFocus={focusFirstControl}
        >
          <div className="drawer-header">
            <div>
              <Dialog.Title>
                {creating ? 'Add spending policy' : draft?.name || 'Spending policy'}
              </Dialog.Title>
              <Dialog.Description id="policy-description">
                {mode === 'demo'
                  ? 'Sample limits, saved in this browser.'
                  : creating
                    ? 'Register a public key and set its spending limits.'
                    : 'Spending limits for this agent’s public key.'}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close agent policy">
              <X size={20} />
            </Dialog.Close>
          </div>
          {draft && (
            <form onSubmit={saveAgent} className="policy-form" aria-busy={busy}>
              <AgentPolicyFields controller={controller} firstField={firstField} />
              <div className="drawer-bottom">
                {canEdit ? (
                  <button className="button primary full" type="submit" disabled={busy}>
                    {busy && <LoaderCircle size={16} className="policy-busy" aria-hidden="true" />}
                    {busy ? pendingLabel : actionLabel}
                  </button>
                ) : (
                  <Dialog.Close className="button secondary full">Done</Dialog.Close>
                )}
                {!creating && canFreeze && (
                  <button
                    type="button"
                    className={`button freeze-button ${draft.frozen ? 'resume-button' : ''}`}
                    disabled={busy}
                    onClick={() => freezeAgent(draft, !draft.frozen)}
                  >
                    <Snowflake size={15} aria-hidden="true" />
                    {draft.frozen ? 'Resume agent' : 'Freeze agent'}
                  </button>
                )}
                {mode === 'local' && canEdit && (
                  <p className="policy-footer-note">Applies to your local test chain.</p>
                )}
                {mode === 'live' && canEdit && (
                  <p className="policy-footer-note">Review and sign in your wallet.</p>
                )}
                {!canEdit && (
                  <p className="policy-footer-note">
                    Owner authorization is required to make changes.
                  </p>
                )}
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
