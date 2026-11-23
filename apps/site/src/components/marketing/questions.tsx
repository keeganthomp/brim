import { Question } from './question';

export function Questions() {
  return (
    <section className="site-shell questions" aria-labelledby="questions-title">
      <h2 id="questions-title" data-reveal="">
        Common questions
      </h2>
      <div className="questions-list">
        <Question title="Who holds the keys?">
          <p>
            The owner signs from their wallet. The bot signs from its own runtime. The program
            controls the vault’s USDC account and checks the policy for every payment.
          </p>
        </Question>
        <Question title="What is a vault config?">
          <p>
            Your vault config contains public connection details: the vault, network, program, and
            trusted fee payers. Your agent’s key and on-chain policy authorize spending.
          </p>
        </Question>
        <Question title="Which x402 APIs work with Brim?">
          <p>
            The merchant needs a Solana x402 v2 facilitator configured to verify smart-wallet
            transfers and allowlist the Brim program.{' '}
            <a className="text-link" href="/docs/x402/">
              See facilitator requirements.
            </a>
          </p>
        </Question>
        <Question title="What can I try today?">
          <p>
            The local quickstart runs a real program payment with test USDC and shows the verified
            result in the dashboard. Public-network deployment and wallet-signed dashboard actions
            are still in development.{' '}
            <a className="text-link" href="/docs/production/">
              See production readiness.
            </a>
          </p>
        </Question>
      </div>
    </section>
  );
}
