export function SpendingFlow() {
  return (
    <section
      className="site-shell spending-flow"
      id="how-it-works"
      aria-labelledby="spending-title"
    >
      <div className="section-intro">
        <h2 id="spending-title">
          One vault.
          <br />A policy for each agent.
        </h2>
        <p>
          Keep the vault in your control. Each bot uses its own signing key and gets a separate set
          of spending rules.
        </p>
        <a className="text-link" href="/docs/vaults-and-policies/">
          Explore vaults and policies
        </a>
      </div>
      <div className="policy-example">
        <div className="policy-example-head">
          <div>
            <span className="policy-caption">Example policy</span>
            <h3>Research agent</h3>
          </div>
          <span className="example-status">
            <i aria-hidden="true" /> Active
          </span>
        </div>
        <dl className="policy-limits">
          <div>
            <dt>Per-payment limit</dt>
            <dd>$1.00</dd>
          </div>
          <div>
            <dt>24-hour budget</dt>
            <dd>$50.00</dd>
          </div>
          <div>
            <dt>Recipients</dt>
            <dd>Allowlist</dd>
          </div>
        </dl>
        <div className="policy-spend">
          <div>
            <span>Used this window</span>
            <strong>$14.20</strong>
          </div>
          <div
            className="policy-meter"
            role="meter"
            aria-label="Budget used"
            aria-valuemin={0}
            aria-valuemax={50}
            aria-valuenow={14.2}
          >
            <span />
          </div>
        </div>
      </div>
      <ol className="spending-steps">
        <li>
          <h3>Fund a vault</h3>
          <p>Your wallet authorizes the vault and its USDC deposits.</p>
        </li>
        <li>
          <h3>Set a policy</h3>
          <p>
            Register the bot’s public key, then set caps, payment spacing, and approved recipients.
          </p>
        </li>
        <li>
          <h3>Make a payment</h3>
          <p>The bot signs a paid request. Solana applies its policy before transferring USDC.</p>
        </li>
      </ol>
    </section>
  );
}
