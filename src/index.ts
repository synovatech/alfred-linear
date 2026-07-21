import { readTokens, startOAuthFlow } from './auth';
import { getIssueDetail } from './commands/detail';
import { createIssue } from './commands/create';
import { searchIssues } from './commands/search';
import {
  alfredOutput,
  makeSetupItem,
  makeCreatePreviewItem,
  makeEmptyQueryItem,
  makeSmartOptionItem,
  makeNoSmartOptionItem,
} from './alfred';
import { LINEAR_CLIENT_ID } from './config';
import { SMART_OPTIONS, matchSmartOptions } from './smartOptions';

type ParsedQuery =
  | { mode: 'search'; query: string; includeAll: boolean }
  | { mode: 'create'; team: string; title: string }
  | { mode: 'smartOptions'; partial: string }
  | { mode: 'empty' };

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim();
  if (!q) return { mode: 'empty' };

  const createMatch = q.match(/^\+([A-Z]{2,5})\s+(.+)$/);
  if (createMatch) return { mode: 'create', team: createMatch[1], title: createMatch[2] };

  if (q.startsWith(':')) {
    const spaceIdx = q.search(/\s/);
    // No space yet → still picking a smart option; let the caller offer matches.
    if (spaceIdx === -1) return { mode: 'smartOptions', partial: q.slice(1) };

    const token = q.slice(1, spaceIdx).toLowerCase();
    const term = q.slice(spaceIdx + 1).trim();
    // A bare token with no term never reaches here — trim() removes the
    // trailing space, so it parses as picker mode above.
    const known = SMART_OPTIONS.find((o) => o.token === token);
    if (known) {
      // Only 'all' (bypass the active-state filter) exists today.
      return { mode: 'search', query: term, includeAll: known.token === 'all' };
    }
    // Unknown token + a space → treat the whole thing as a literal search.
  }

  return { mode: 'search', query: q, includeAll: false };
}

export async function runMain(args: string[]): Promise<void> {
  // Flag-based dispatch (called from Alfred Run Script nodes, not Script Filter)
  if (args[0] === '--auth') {
    await startOAuthFlow(LINEAR_CLIENT_ID);
    return;
  }

  if (args[0] === '--detail') {
    if (!readTokens()) {
      process.stdout.write('# Not connected to Linear\n\nType `lin setup::auth` in Alfred to connect your account.');
      return;
    }
    const md = await getIssueDetail(args[1]);
    process.stdout.write(md);
    return;
  }

  if (args[0] === '--create') {
    if (!readTokens()) {
      alfredOutput([makeSetupItem()]);
      return;
    }
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

  if (parsed.mode === 'smartOptions') {
    const matches = matchSmartOptions(parsed.partial);
    alfredOutput(
      matches.length > 0
        ? matches.map(makeSmartOptionItem)
        : [makeNoSmartOptionItem(parsed.partial)],
    );
    return;
  }

  const items = await searchIssues(parsed.query, parsed.includeAll);
  alfredOutput(items);
}

if (require.main === module) {
  runMain(process.argv.slice(2)).catch((err) => {
    alfredOutput([{ title: 'Error', subtitle: String(err?.message ?? err), valid: false }]);
    process.exit(1);
  });
}
