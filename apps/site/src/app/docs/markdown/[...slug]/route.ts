import { docsText, markdownSlug, renderDocMarkdown } from '@/lib/agent-docs';
import { source } from '@/lib/source';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: markdownSlug(page) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const name = (await params).slug.join('/');
  const page = source.getPages().find((item) => markdownSlug(item).join('/') === name);
  if (!page) return new Response('Guide not found.', { status: 404 });
  return docsText(await renderDocMarkdown(page), 'text/markdown');
}
