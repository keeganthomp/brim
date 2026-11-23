export function DeveloperExample() {
  return (
    <section
      className="site-shell developer-example"
      id="developers"
      aria-labelledby="developers-title"
    >
      <div className="section-intro">
        <h2 id="developers-title">One fetch call.</h2>
        <p>
          Use <code>brimFetch</code> for x402 endpoints. Give it the public vault config and the
          bot’s signing key. Brim picks the RPC for that network.
        </p>
        <div className="developer-links">
          <a className="text-link" href="/docs/sdk/">
            TypeScript SDK
          </a>
          <a className="text-link" href="/docs/mcp/">
            MCP setup
          </a>
        </div>
      </div>
      <figure className="source-example" aria-label="TypeScript example using the Brim SDK">
        <figcaption>
          <span>agent.ts</span>
          <span>TypeScript</span>
        </figcaption>
        <pre>
          <code>
            <span className="code-keyword">import</span>
            {' { createBrimFetch } '}
            <span className="code-keyword">from</span>{' '}
            <span className="code-string">'@brim/sdk'</span>
            {';\n\n'}
            <span className="code-keyword">const</span>
            {' brimFetch = '}
            <span className="code-function">createBrimFetch</span>
            {
              '({\n  vaultConfig: process.env.BRIM_VAULT_CONFIG!,\n  agentKey: process.env.BRIM_AGENT_KEY!,\n});\n\n'
            }
            <span className="code-keyword">const</span>
            {' response = '}
            <span className="code-keyword">await</span>
            {' brimFetch(\n  '}
            <span className="code-string">'https://api.example.com/report'</span>
            {',\n);'}
          </code>
        </pre>
      </figure>
    </section>
  );
}
