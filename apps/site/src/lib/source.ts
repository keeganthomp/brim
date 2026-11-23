import { loader } from 'fumadocs-core/source';
import { docs } from '../../.source/server';

/** One content tree drives pages, search, and agent-readable Markdown. */
export const source = loader({ baseUrl: '/docs', source: docs.toFumadocsSource() });
