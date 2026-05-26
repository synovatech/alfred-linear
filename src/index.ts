import { readTokens, startOAuthFlow } from './auth';
import { getIssueDetail } from './commands/detail';
import { createIssue } from './commands/create';
import { searchIssues } from './commands/search';
import {
  alfredOutput,
  makeSetupItem,
  makeCreatePreviewItem,
  makeEmptyQueryItem,
} from './alfred';
import { LINEAR_CLIENT_ID } from './config';

type ParsedQuery =
  | { mode: 'search'; query: string }
  | { mode: 'create'; team: string; title: string }
  | { mode: 'empty' };

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim();
  if (!q) return { mode: 'empty' };
  const createMatch = q.match(/^\+([A-Z]{2,5})\s+(.+)$/);
  if (createMatch) return { mode: 'create', team: createMatch[1], title: createMatch[2] };
  return { mode: 'search', query: q };
}

export async function runMain(args: string[]): Promise<void> {
  // Flag-based dispatch (called from Alfred Run Script nodes, not Script Filter)
  if (args[0] === '--auth') {
    await startOAuthFlow(LINEAR_CLIENT_ID);
    return;
  }

  if (args[0] === '--detail') {
    const md = await getIssueDetail(args[1]);
    process.stdout.write(md);
    return;
  }

  if (args[0] === '--create') {
    const url = await createIssue(args[1]);
    process.stdout.write(url);
    return;
  }

  // Script Filter invocation
  if (!readTokens()) {
    alfredOutput([makeSetupItem()]);
    return;
  }

  const parsed = parseQuery(args[0] ?? '');

  if (parsed.mode === 'empty') {
    alfredOutput([makeEmptyQueryItem()]);
    return;
  }

  if (parsed.mode === 'create') {
    alfredOutput([makeCreatePreviewItem(parsed.team, parsed.title)]);
    return;
  }

  const items = await searchIssues(parsed.query);
  alfredOutput(items);
}

if (require.main === module) {
  runMain(process.argv.slice(2)).catch((err) => {
    alfredOutput([{ title: 'Error', subtitle: String(err?.message ?? err), valid: false }]);
    process.exit(1);
  });
}
