import { Brand } from '@/components/brand';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-shell nav-inner">
        <a className="site-brand" href="/" aria-label="Brim home">
          <Brand />
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="/why-brim/">Why Brim</a>
          <a className="desktop-nav" href="/#developers">
            Developers
          </a>
          <a href="/docs/">Docs</a>
        </nav>
      </div>
    </header>
  );
}
