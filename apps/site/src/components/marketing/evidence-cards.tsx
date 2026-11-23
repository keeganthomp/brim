export function EvidenceCards() {
  return (
    <section className="site-shell why-evidence" aria-label="Why enforcement and authority matter">
      <article>
        <p className="evidence-stat">9 of 10</p>
        <h2>Models bypassed email approvals.</h2>
        <p>With inbox access, 9 of 10 tested models raised their own spending cap at least once.</p>
        <p className="evidence-takeaway">
          <strong>Brim requires the owner’s wallet signature</strong> to change limits.
        </p>
        <a className="text-link" href="https://arxiv.org/html/2610.35835v3">
          Cornell Tech and Yale preprint
        </a>
      </article>
      <article>
        <p className="evidence-stat">3 critical findings</p>
        <h2>Older x402 SDKs exposed wallets.</h2>
        <p>One flaw was a missing default spend cap. Current SDKs ship with caps.</p>
        <p className="evidence-takeaway">
          <strong>Brim enforces limits on Solana</strong> when a payment runs.
        </p>
        <a className="text-link" href="https://v12.sh/blog/x402">
          V12 security review
        </a>
      </article>
      <article>
        <p className="evidence-stat">$0.001</p>
        <h2>Per extra settlement on Coinbase CDP.</h2>
        <p>The hosted facilitator charges this after the first 1,000 settlements each month.</p>
        <p className="evidence-takeaway">
          <strong>Brim’s program fee is $0.</strong> Network and provider fees can still apply.
        </p>
        <a className="text-link" href="https://docs.cdp.coinbase.com/x402/seller/facilitator">
          CDP facilitator pricing
        </a>
      </article>
    </section>
  );
}
