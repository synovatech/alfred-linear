import { readTokens, startOAuthFlow } from './auth';
import { getIssueDetail } from './commands/detail';
import { createIssue } from './commands/create';
import { searchIssues, listIssues } from './commands/search';
import { fetchTeams, fetchProjects } from './commands/lookups';
import {
  alfredOutput,
  makeSetupItem,
  makeCreatePreviewItem,
  makeEmptyQueryItem,
  makeOptionPickerItem,
  makeTeamItem,
  makeProjectItem,
  makePriorityItem,
  makeNoSmartOptionItem,
  type AlfredItem,
} from './alfred';
import { LINEAR_CLIENT_ID } from './config';
import { parseQuery, type ParsedQuery } from './query';
import { optionsByPrefix, PRIORITY_CHOICES } from './smartOptions';

export { parseQuery } from './query';

function noMatch(label: string): AlfredItem {
  return { title: `No matching ${label}`, subtitle: 'Keep typing or change your filters', valid: false };
}

async function outputSuggestions(p: Extract<ParsedQuery, { mode: 'suggest' }>): Promise<void> {
  const { source, partial, prefix } = p;

  if (source === 'options') {
    const matches = optionsByPrefix(partial);
    alfredOutput(matches.length > 0 ? matches.map((o) => makeOptionPickerItem(o, prefix)) : [makeNoSmartOptionItem(partial)]);
    return;
  }

  if (source === 'priority') {
    const pl = partial.toLowerCase();
    const choices = PRIORITY_CHOICES.filter((c) => c.label.toLowerCase().startsWith(pl));
    alfredOutput(choices.length > 0 ? choices.map((c) => makePriorityItem(c, prefix)) : [noMatch('priority')]);
    return;
  }

  if (source === 'teams') {
    const teams = await fetchTeams(partial);
    alfredOutput(teams.length > 0 ? teams.map((t) => makeTeamItem(t, prefix)) : [noMatch('team')]);
    return;
  }

  const projects = await fetchProjects(partial, p.teamKey);
  alfredOutput(projects.length > 0 ? projects.map((pr) => makeProjectItem(pr, prefix)) : [noMatch('project')]);
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

  switch (parsed.mode) {
    case 'empty':
      alfredOutput([makeEmptyQueryItem()]);
      return;
    case 'create':
      alfredOutput([makeCreatePreviewItem(parsed.team, parsed.title)]);
      return;
    case 'suggest':
      await outputSuggestions(parsed);
      return;
    case 'search':
      alfredOutput(await searchIssues(parsed.term, parsed.filter));
      return;
    case 'list':
      alfredOutput(await listIssues(parsed.filter));
      return;
  }
}

if (require.main === module) {
  runMain(process.argv.slice(2)).catch((err) => {
    alfredOutput([{ title: 'Error', subtitle: String(err?.message ?? err), valid: false }]);
    process.exit(1);
  });
}
