import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Snowflake, X } from 'lucide-react';
import type { AgentPolicyController } from '../../hooks/use-agent-policy';
import { AgentPolicyFields } from './agent-policy-fields';
import { useDialogFocus } from '../ui/use-dialog-focus';
export function AgentPolicyDrawer({ controller }: { controller: AgentPolicyController }) {
  const { draft, creating, error, setDraft, saveAgent, copyConfig, freezeAgent } = controller;
  const nameField = useRef<HTMLInputElement>(null);
  const focus = useDialogFocus(nameField);
  const content = useRef<HTMLDivElement>(null);
  function focusFirstControl(event: Event) {
    // A touch user can read the limits before deliberately opening a soft keyboard.
    event.preventDefault();
    if (window.matchMedia('(pointer: coarse)').matches) {
      content.current?.focus({ preventScroll: true });
      return;
    }
    const first = creating
      ? nameField.current
      : content.current?.querySelector<HTMLInputElement>('input[type="number"]');
    first?.focus({ preventScroll: true });
    if (!creating) first?.select();
  }
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
              <Dialog.Title>{creating ? 'Add spending policy' : draft?.name}</Dialog.Title>
              <Dialog.Description id="policy-description">
                {creating
                  ? 'Set how much an existing agent can spend from this vault.'
                  : 'Manage this agent’s limits and payment permissions.'}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close agent policy">
              <X size={20} />
            </Dialog.Close>
          </div>
          {draft && (
            <form onSubmit={saveAgent} className="policy-form">
              <AgentPolicyFields
                draft={draft}
                setDraft={setDraft}
                copyConfig={copyConfig}
                error={error}
                nameField={nameField}
              />
              <div className="drawer-bottom">
                <button className="button primary full" type="submit">
                  <Check size={16} />
                  {creating ? 'Add demo policy' : 'Save demo policy'}
                </button>
                {!creating && (
                  <button
                    type="button"
                    aria-describedby="policy-freeze-help"
                    className={`button freeze-button ${draft.frozen ? 'resume-button' : ''}`}
                    onClick={() => {
                      freezeAgent(draft, !draft.frozen);
                      setDraft(null);
                    }}
                  >
                    <Snowflake size={16} />
                    {draft.frozen ? 'Resume agent' : 'Freeze agent'}
                  </button>
                )}
                {!creating && (
                  <p id="policy-freeze-help" className="policy-freeze-help">
                    {draft.frozen
                      ? 'Resume uses the saved policy limits.'
                      : 'Freezes payments. Your agent can keep running.'}
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
