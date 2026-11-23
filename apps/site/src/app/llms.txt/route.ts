import { agentDocsIndex, docsText } from '@/lib/agent-docs';

export const dynamic = 'force-static';

export function GET() {
  return docsText(agentDocsIndex());
}
