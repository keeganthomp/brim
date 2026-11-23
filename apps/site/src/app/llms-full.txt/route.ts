import { docsText, fullAgentDocs } from '@/lib/agent-docs';

export const dynamic = 'force-static';

export async function GET() {
  return docsText(await fullAgentDocs());
}
