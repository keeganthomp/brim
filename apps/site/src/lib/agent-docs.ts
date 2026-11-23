import { source } from './source';

type DocPage = typeof source.$inferPage;

const markdownRoot = '/docs/markdown';
const startHere = new Set(['agents', 'quickstart']);
const description =
  'Brim gives AI agents scoped spending policies for USDC payments on Solana. The SDK and MCP use the same on-chain policy and x402 payment engine.';

export function markdownSlug(page: DocPage) {
  return [...page.slugs.slice(0, -1), `${page.slugs.at(-1) ?? 'index'}.md`];
}

export function markdownPath(page: DocPage) {
  return `${markdownRoot}/${markdownSlug(page).join('/')}`;
}

function docPages() {
  return [...source.getPages()].sort((a, b) => a.url.localeCompare(b.url));
}

function guideLink(page: DocPage) {
  const link = `- [${page.data.title}](${markdownPath(page)})`;
  return page.data.description ? `${link}: ${page.data.description}` : link;
}

export function agentDocsIndex() {
  const pages = docPages();
  return [
    '# Brim',
    '',
    `> ${description}`,
    '',
    'Start with the offline local stack: npm ci, npm run dev, then npm run demo:payment in another terminal. It uses fake USDC and verifies a real x402 payment through the compiled program and Postgres ledger. The SDK and MCP are built from this private repository workspace.',
    '',
    'For your own agent, keep its existing scoped key or run `npm run agent:key -- --out .brim/research-agent.json`. The helper writes a private mode-0600 file and prints only its public key and path.',
    '',
    'In Local workspace, Add policy registers an existing agent Ed25519 PUBLIC key and limits using the generated Surfpool test owner. Wait for on-chain confirmation before paying. Local funding, withdrawals, and freezes remain read-only. Demo controls are simulated. A separately configured Live workspace can request policy signatures from an ordinary Wallet Standard owner wallet for an existing deployed vault; no public deployment or Squads support is claimed.',
    '',
    '`BRIM_VAULT_CONFIG` is shared public connection metadata. Keep each agent’s private `BRIM_AGENT_KEY` in its own runtime, never in dashboard fields, prompts, logs, or tool arguments. Register only its public key. The local SDK/MCP must use the Surfpool RPC URL, not the default public devnet RPC.',
    '',
    'Live operation requires a deployed program, a funded vault, an authorized policy, a compatible facilitator, and the release checks in Production readiness. After `PAYMENT_OUTCOME_UNKNOWN` or an uncertain paid response, reconcile settlement before authorizing a new payment.',
    '',
    '## Start here',
    '',
    ...pages.filter((page) => startHere.has(page.slugs.join('/'))).map(guideLink),
    '- [Complete documentation](/llms-full.txt): All public guides in one Markdown document.',
    '',
    '## Reference',
    '',
    ...pages.filter((page) => !startHere.has(page.slugs.join('/'))).map(guideLink),
    '',
    '## Optional',
    '',
    '- [Why Brim](/why-brim/): Where Brim fits alongside wallets, x402 clients, and treasury tools.',
    '',
  ].join('\n');
}

export async function renderDocMarkdown(page: DocPage) {
  const body = await page.data.getText('processed');
  return [
    `# ${page.data.title}`,
    '',
    page.data.description,
    '',
    `[Web guide](${page.url.replace(/\/$/, '')}/) · [Documentation index](/llms.txt)`,
    '',
    body.trim(),
    '',
  ].join('\n');
}

export async function fullAgentDocs() {
  const pages = docPages();
  const ordered = [
    ...pages.filter((page) => startHere.has(page.slugs.join('/'))),
    ...pages.filter((page) => !startHere.has(page.slugs.join('/'))),
  ];
  const guides = await Promise.all(ordered.map(renderDocMarkdown));
  return `# Brim documentation\n\n${description}\n\n${guides.join('\n---\n\n')}`;
}

export function docsText(body: string, type: 'text/plain' | 'text/markdown' = 'text/plain') {
  return new Response(body, {
    headers: { 'content-type': `${type}; charset=utf-8` },
  });
}
