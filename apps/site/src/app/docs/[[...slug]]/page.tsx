import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

type PageProps = { params: Promise<{ slug?: string[] }> };

export default async function DocumentationPage({ params }: PageProps) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const Body = page.data.body;
  return (
    <DocsPage
      className="brim-doc-page"
      toc={page.data.toc}
      full={page.data.full ?? false}
      breadcrumb={{ enabled: true, className: 'brim-doc-breadcrumb' }}
      footer={{ enabled: true, className: 'brim-doc-pagination' }}
      tableOfContent={{ container: { className: 'brim-doc-toc' } }}
    >
      <DocsTitle className="brim-doc-title">{page.data.title}</DocsTitle>
      <DocsDescription className="brim-doc-description">{page.data.description}</DocsDescription>
      <DocsBody className="brim-doc-prose">
        <Body components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
