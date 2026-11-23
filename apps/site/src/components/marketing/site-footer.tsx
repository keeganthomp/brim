import { Brand } from '@/components/brand';

export function SiteFooter() {
  return (
    <footer className="site-shell site-footer">
      <a className="site-brand" href="/" aria-label="Brim home">
        <Brand />
      </a>
      <nav aria-label="Footer navigation">
        <a href="/why-brim/">Why Brim</a>
        <a href="/docs/">Documentation</a>
        <a href="/docs/sdk/">SDK</a>
        <a href="/docs/mcp/">MCP</a>
      </nav>
    </footer>
  );
}
