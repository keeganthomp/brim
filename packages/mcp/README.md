# Brim MCP

Connect Claude Desktop, Cursor, or another MCP client using a Brim card and the agent's scoped signing key. It gets three tools:

| Tool           | What it does                                                   |
| -------------- | -------------------------------------------------------------- |
| `brim_balance` | Reads the vault's USDC balance.                                |
| `brim_policy`  | Reads this agent's limits, recorded spend, and freeze state.   |
| `brim_fetch`   | Calls a paid API through the agent's on-chain spending policy. |

## Try it locally

Run `npm ci` and `npm run dev` from the repository root. Add this entry to Claude Desktop's MCP configuration or Cursor's `.cursor/mcp.json`, replacing the two absolute paths:

```json
{
  "mcpServers": {
    "brim-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/brim/packages/mcp/dist/cli.js",
        "--local",
        "/absolute/path/to/brim/.brim/local.json"
      ]
    }
  }
}
```

Use Node 24. If your desktop client cannot find `node`, set `command` to its absolute path. Refresh the MCP connection, then ask:

> Check my Brim balance and policy. Then use `brim_fetch` to fetch `http://127.0.0.1:4020/report`.

The report costs $0.04 fake USDC. Local mode uses Surfpool and permits only this local report endpoint.

## Connect your card

Build the packages with `npm run build:packages`. Get the public card from your treasury operator and configure the scoped keypair you generated:

```json
{
  "mcpServers": {
    "brim": {
      "command": "node",
      "args": ["/absolute/path/to/brim/packages/mcp/dist/cli.js"],
      "env": {
        "BRIM_CARD": "brim:v1:REPLACE_WITH_THE_FULL_CARD",
        "BRIM_AGENT_KEY": "YOUR_SCOPED_AGENT_KEYPAIR_AS_A_JSON_ARRAY"
      }
    }
  }
}
```

Brim chooses the public Solana RPC for the card's network. Optionally set `SOLANA_RPC_URL` to use your own provider; both balance reads and payments use that connection. An invalid explicit URL fails setup. The package is a private workspace; use the built CLI from your checkout.

`BRIM_AGENT_KEY` is a string containing the full agent keypair JSON array (64 integers). Share the matching public key with the operator for policy registration. Keep the keypair in the MCP process's secret environment or in a private client configuration outside source control.

Your operator sets the policy, funds the vault, and configures a facilitator that supports the deployed Brim program. The SDK adds a $1 USDC per-payment safety cap; the on-chain policy remains authoritative. The tools cannot change keys or policies, raise limits, or withdraw funds.

## Request behavior

`brim_fetch` supports `GET` and `POST`; a POST body is a string. Card configuration uses HTTPS resources. Responses are bounded to 64 KiB, errors are redacted, and MCP cancellation interrupts the Effect workflow. Setup never makes a paid request.

The server speaks MCP over standard input/output without printing keys, card configuration, RPC credentials, or startup messages to the protocol stream. A timeout, unreadable response, or invalid settlement receipt can leave the payment outcome uncertain; reconcile the original payment before making another paid call. Receipts are bounded and checked for the configured network and signature format. They are reported by the resource, not independent proof of finalized settlement.

See [how to get your card and key](../sdk/README.md#get-your-card-and-key) and [facilitator compatibility](../../docs/x402.md#facilitator-operator-configuration).

This is a local stdio process for an operator-approved agent client, with one agent key per process. A spending policy does not sandbox network access: HTTPS resources may intentionally be private APIs, and an explicit RPC URL is trusted operator configuration. A hosted transport must provide its own authentication, per-agent key isolation, and network egress policy; the stdio server does not provide those boundaries. Cancellation stops local work but cannot reverse an authorization already sent.
