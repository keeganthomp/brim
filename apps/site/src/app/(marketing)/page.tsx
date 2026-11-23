import { ArrowRight } from '@/components/marketing/arrow-right';
import { DeveloperExample } from '@/components/marketing/developer-example';
import { SpendingFlow } from '@/components/marketing/spending-flow';
import { Questions } from '@/components/marketing/questions';

export default function Home() {
  return (
    <>
      <section className="hero site-shell" aria-labelledby="hero-title">
        <div className="hero-content">
          <div className="hero-network">USDC payments on Solana</div>
          <h1 id="hero-title">
            Give agents
            <br />a budget.
          </h1>
          <p>
            Set spending rules for your agents. Enforced on Solana every time they pay through your
            vault.
          </p>
          <div className="hero-actions">
            <a className="site-button hero-primary" href="/docs/quickstart/">
              Run the quickstart
              <ArrowRight />
            </a>
          </div>
        </div>
      </section>
      <SpendingFlow />
      <DeveloperExample />
      <Questions />
      <section
        className="site-shell get-started"
        aria-labelledby="get-started-title"
        data-reveal=""
      >
        <div>
          <h2 id="get-started-title">Make your first payment.</h2>
          <p>Run the local stack and settle a $0.04 x402 request with test USDC.</p>
        </div>
        <a className="site-button dark-button" href="/docs/quickstart/">
          Start locally
          <ArrowRight />
        </a>
      </section>
    </>
  );
}
