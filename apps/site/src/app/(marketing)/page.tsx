import { Brand } from '@/components/brand';
import { DeveloperExample } from '@/components/marketing/developer-example';
import { SpendingFlow } from '@/components/marketing/spending-flow';
import { Questions } from '@/components/marketing/questions';
import '@/styles/marketing.css';
import '@/styles/sections.css';

export default function Home() {
  return (
    <div className="marketing">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-shell nav-inner">
          <a className="site-brand" href="/" aria-label="Brim home">
            <Brand />
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            <a className="desktop-nav" href="#how-it-works">
              How it works
            </a>
            <a className="desktop-nav" href="#developers">
              Developers
            </a>
            <a href="/docs/">Docs</a>
          </nav>
          <a className="site-button nav-cta" href="/docs/quickstart/">
            Quickstart
          </a>
        </div>
      </header>
      <main id="content">
        <section className="hero site-shell" aria-labelledby="hero-title">
          <div className="hero-art" aria-hidden="true">
            {/* The artwork is decorative and shipped as a pre-compressed static file. */}
            <img
              src="/brim-hero.webp"
              alt=""
              width={1536}
              height={1024}
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <div className="hero-content">
            <div className="hero-network">USDC payments on Solana</div>
            <h1 id="hero-title">
              Give agents
              <br />a budget.
            </h1>
            <p>
              Set spending rules for the bots you already run. Brim enforces them on Solana every
              time a bot pays through your vault.
            </p>
            <div className="hero-actions">
              <a className="site-button hero-primary" href="/docs/quickstart/">
                Run the quickstart
              </a>
              <a className="site-button hero-secondary" href="/docs/">
                Read the docs
              </a>
            </div>
          </div>
        </section>
        <div className="site-shell tech-line" aria-label="Supported payment stack">
          <span>
            Solana <small>Policy enforcement</small>
          </span>
          <span>
            USDC <small>Vault and payments</small>
          </span>
          <span>
            x402 v2 <small>Paid APIs</small>
          </span>
        </div>
        <SpendingFlow />
        <DeveloperExample />
        <Questions />
        <section className="site-shell get-started" aria-labelledby="get-started-title">
          <div>
            <h2 id="get-started-title">Make your first payment.</h2>
            <p>Run the local stack and settle a $0.04 x402 request with test USDC.</p>
          </div>
          <a className="site-button dark-button" href="/docs/quickstart/">
            Start locally
          </a>
        </section>
      </main>
      <footer className="site-shell site-footer">
        <a className="site-brand" href="/" aria-label="Brim home">
          <Brand />
        </a>
        <nav aria-label="Footer navigation">
          <a href="/docs/">Documentation</a>
          <a href="/docs/sdk/">SDK</a>
          <a href="/docs/mcp/">MCP</a>
        </nav>
      </footer>
    </div>
  );
}
