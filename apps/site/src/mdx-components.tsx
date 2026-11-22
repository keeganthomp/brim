import defaultComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

/** Keep Fumadocs' accessible anchors, copy controls, tables, and code blocks. */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultComponents, ...components };
}
