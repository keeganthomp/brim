import { loader } from 'fumadocs-core/source';
import { docs } from '../../.source/server';

/** One content tree drives navigation, page rendering, and the static search index. */
export const source = loader({ baseUrl: '/docs', source: docs.toFumadocsSource() });
