import { useRef } from 'react';
import { ChevronDown, Copy, LoaderCircle } from 'lucide-react';
import type { AgentPolicyController } from '../../hooks/use-agent-policy';
import { Disclosure } from '../ui/disclosure';

const statusCopy = {
  idle: '',
  checking: 'Checking policy and payment terms…',
  ready: 'Policy checks passed.',
  blocked: 'Payment is blocked by this policy.',
  error: 'Could not verify the connection.',
};

export function PolicySetup({ controller }: { controller: AgentPolicyController }) {
  const { mode, busy, creating, copyConfig, connectionStatus, checkConnection } = controller;
  const resource = useRef<HTMLInputElement>(null);
  const checking = connectionStatus.status === 'checking';
  return (
    <Disclosure
      className="policy-details policy-setup"
      summary={
        <>
          Code setup
          <ChevronDown size={16} aria-hidden="true" />
        </>
      }
    >
      <div className="policy-details-content">
        <p>
          {mode === 'demo'
            ? 'Copy a sample setup with placeholders.'
            : 'Includes your public vault config. Keep the scoped signing key in your agent runtime.'}
        </p>
        <button
          type="button"
          className="button secondary small"
          onClick={copyConfig}
          disabled={busy}
        >
          <Copy size={14} aria-hidden="true" /> Copy setup
        </button>
        {mode !== 'demo' && !creating && controller.draft?.agentKey && (
          <div className="policy-connection">
            <label htmlFor="merchant-resource-url">
              Merchant URL <span>Optional</span>
            </label>
            <input
              ref={resource}
              id="merchant-resource-url"
              type="text"
              maxLength={2048}
              className="text-input"
              placeholder="https://api.example.com/report"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy || checking}
              aria-describedby="connection-help"
            />
            <p id="connection-help">
              Checks the policy and optional public payment quote. No payment is sent. Some APIs
              block browser requests (CORS).
            </p>
            <button
              type="button"
              className="button secondary small"
              disabled={busy || checking}
              aria-busy={checking}
              onClick={() => void checkConnection(resource.current?.value.trim() || undefined)}
            >
              {checking && <LoaderCircle className="busy-indicator" size={14} aria-hidden="true" />}
              {checking ? 'Checking…' : 'Check connection'}
            </button>
            {connectionStatus.status !== 'idle' && (
              <p
                className={`connection-result connection-${connectionStatus.status}`}
                role={connectionStatus.status === 'error' ? 'alert' : 'status'}
              >
                {('message' in connectionStatus && connectionStatus.message) ||
                  statusCopy[connectionStatus.status]}
              </p>
            )}
          </div>
        )}
      </div>
    </Disclosure>
  );
}
