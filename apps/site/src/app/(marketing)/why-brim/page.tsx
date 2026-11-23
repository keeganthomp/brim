import type { Metadata } from 'next';
import { Alternatives } from '@/components/marketing/alternatives';
import { ArrowRight } from '@/components/marketing/arrow-right';
import { EvidenceCards } from '@/components/marketing/evidence-cards';
import { PolicyIllustration } from '@/components/marketing/policy-illustration';
import '@/styles/why-brim.css';

export const metadata: Metadata = {
  title: 'Why Brim',
  description:
    'Compare Brim’s shared Solana USDC treasury and per-agent spending policies with x402 client controls and wallet platforms.',
};

export default function WhyBrim() {
  return (
    <div className="why-page">
      <section className="site-shell why-hero" aria-labelledby="why-title">
        <h1 id="why-title">
          Agents spend.
          <br />
          You set the limits.
        </h1>
        <p>
          Fund one USDC vault for your agents. Solana enforces each agent’s spending limits, and you
          control the vault.
        </p>
      </section>
      <EvidenceCards />
      <Alternatives />
      <PolicyIllustration />
      <section className="site-shell why-next" aria-labelledby="next-title" data-reveal="">
        <div>
          <h2 id="next-title">Try a payment locally.</h2>
          <p>
            Pay an x402 endpoint with test USDC and see the result in the dashboard.{' '}
            <a className="text-link" href="/docs/production/">
              Check production status
            </a>
          </p>
        </div>
        <a className="site-button dark-button" href="/docs/quickstart/">
          Start locally
          <ArrowRight />
        </a>
      </section>
    </div>
  );
}
