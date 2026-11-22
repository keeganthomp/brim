import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Brand } from '@/components/brand';
import { source } from '@/lib/source';
import './docs.css';

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{ enabled: false }}
      search={{ preload: false, options: { type: 'static', api: '/docs/search-index.json' } }}
    >
      <DocsLayout
        tree={source.getPageTree()}
        nav={{ title: <Brand />, url: '/' }}
        themeSwitch={{ enabled: false }}
        sidebar={{ collapsible: false, defaultOpenLevel: 1 }}
        containerProps={{ className: 'brim-docs' }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
