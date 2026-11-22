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
  return (
    <Dialog.Root
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) setDraft(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="policy-drawer" aria-describedby="policy-description" {...focus}>
          <div className="drawer-header">
            <div>
              <span className="eyebrow">AGENT CONTROLS</span>
              <Dialog.Title>{creating ? 'Add spending policy' : draft?.name}</Dialog.Title>
              <Dialog.Description id="policy-description">
                {creating
                  ? 'Set limits on what a bot or app you already run can spend from this vault.'
                  : 'Adjust this agent’s spending permissions.'}
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
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
