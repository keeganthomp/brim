import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

// The browser downloads this small index on demand; no search service is required.
export const dynamic = 'force-static';
export const revalidate = false;
export const { staticGET: GET } = createFromSource(source);
