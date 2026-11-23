import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { brimDarkCode, brimLightCode } from './src/lib/code-theme';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: { postprocess: { includeProcessedMarkdown: { headingIds: false } } },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: { light: brimLightCode, dark: brimDarkCode },
    },
  },
});
