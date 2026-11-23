export function EvidenceCards() {
  return (
    <section className="site-shell why-evidence" aria-label="Why enforcement and authority matter">
      <article data-reveal="">
        <h2>You control the rules.</h2>
        <p className="evidence-outcome">
          Changing spending limits requires the owner’s wallet signature.
        </p>
        <div className="evidence-proof">
          <p>
            With inbox access, 9 of 10 tested models raised their own spending cap at least once.
          </p>
          <a className="text-link" href="https://arxiv.org/html/2610.35835v3">
            Cornell Tech and Yale preprint
          </a>
        </div>
      </article>
      <article data-reveal="">
        <h2>Solana checks each payment.</h2>
        <p className="evidence-outcome">
          Payment caps and budgets are checked on Solana before your vault transfers USDC.
        </p>
        <div className="evidence-proof">
          <p>
            A review of older x402 SDKs found a missing default spend cap. Current SDKs ship with
            caps.
          </p>
          <a className="text-link" href="https://v12.sh/blog/x402">
            V12 security review
          </a>
        </div>
      </article>
      <aside className="why-fee" aria-label="Brim program fee" data-reveal="">
        <p className="fee-label">$0 Brim program fee</p>
        <p>Network and provider fees can still apply.</p>
      </aside>
    </section>
  );
}
