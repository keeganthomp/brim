export function PolicyIllustration() {
  return (
    <section className="site-shell why-illustration" aria-labelledby="illustration-title">
      <div className="why-illustration-heading" data-reveal="">
        <h2 id="illustration-title">A payment over the limit.</h2>
        <span>Demo</span>
      </div>
      <figure className="policy-demo">
        <div className="policy-demo-steps" aria-hidden="true">
          <div className="demo-step" data-reveal="">
            <span className="demo-label">Attempted payment</span>
            <strong className="demo-value">$4,500.00</strong>
            <span className="demo-detail">Requested by an agent</span>
          </div>
          <div className="demo-step" data-reveal="">
            <span className="demo-label">Per-payment cap</span>
            <strong className="demo-value">$1.00</strong>
            <span className="demo-blocked">Blocked · Over cap</span>
          </div>
          <div className="demo-step" data-reveal="">
            <span className="demo-label">Owner-authorized freeze</span>
            <span className="demo-frozen">Frozen</span>
            <span className="demo-detail">Stops subsequent payments</span>
          </div>
        </div>
        <figcaption data-reveal="">
          A $4,500 request exceeds the $1 cap. The owner then freezes future payments.
        </figcaption>
      </figure>
    </section>
  );
}
