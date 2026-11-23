export function Alternatives() {
  return (
    <section className="site-shell why-alternatives" aria-labelledby="alternatives-title">
      <h2 id="alternatives-title" data-reveal="">
        Where the limits live.
      </h2>
      <div className="why-table-wrap" data-reveal="">
        <table className="why-table" role="table" aria-labelledby="alternatives-title">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col">Option</th>
              <th scope="col">Controls</th>
              <th scope="col">Good fit</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr className="why-table-brim" role="row">
              <th scope="row" role="rowheader">
                Brim
              </th>
              <td role="cell" data-label="Controls">
                Solana enforces payment caps, budgets, allowed recipients, rate limits, and freezes.
              </td>
              <td role="cell" data-label="Good fit">
                Agents paying x402 endpoints from a shared USDC vault you control.
              </td>
            </tr>
            <tr role="row">
              <th scope="row" role="rowheader">
                Burner wallet
              </th>
              <td role="cell" data-label="Controls">
                The balance is the limit.
              </td>
              <td role="cell" data-label="Good fit">
                A small, isolated balance for one agent.
              </td>
            </tr>
            <tr role="row">
              <th scope="row" role="rowheader">
                <a
                  className="text-link"
                  href="https://docs.x402.org/getting-started/quickstart-for-buyers"
                >
                  x402 client SDK
                </a>
              </th>
              <td role="cell" data-label="Controls">
                The client checks the amount and asset before signing.
              </td>
              <td role="cell" data-label="Good fit">
                Paying APIs directly from a wallet.
              </td>
            </tr>
            <tr role="row">
              <th scope="row" role="rowheader">
                Wallet platforms
              </th>
              <td role="cell" data-label="Controls">
                Wallet policies and signing controls from{' '}
                <a
                  className="text-link"
                  href="https://docs.cdp.coinbase.com/api-reference/v2/rest-api/policy-engine/policy-engine"
                >
                  Coinbase
                </a>
                ,{' '}
                <a className="text-link" href="https://docs.privy.io/agent-wallets/control">
                  Privy
                </a>
                , and{' '}
                <a
                  className="text-link"
                  href="https://docs.turnkey.com/solutions/company-wallets/agentic-wallets"
                >
                  Turnkey
                </a>
                , and{' '}
                <a className="text-link" href="https://www.crossmint.com/products/agentic-wallets">
                  Crossmint
                </a>
                . Rules vary by provider.
              </td>
              <td role="cell" data-label="Good fit">
                Managed signing and wallet provisioning.
              </td>
            </tr>
            <tr role="row">
              <th scope="row" role="rowheader">
                <a
                  className="text-link"
                  href="https://docs.squads.so/main/navigating-your-squad/settings/spending-limits"
                >
                  Squads spending limits
                </a>
              </th>
              <td role="cell" data-label="Controls">
                Solana enforces token allowances and destination limits.
              </td>
              <td role="cell" data-label="Good fit">
                Treasury allowances for Squads members.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
