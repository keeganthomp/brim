import type { ReactNode } from 'react';
import { RevealOnScroll } from '@/components/marketing/reveal-on-scroll';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';
import '@/styles/marketing.css';
import '@/styles/sections.css';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
      <RevealOnScroll />
    </div>
  );
}
