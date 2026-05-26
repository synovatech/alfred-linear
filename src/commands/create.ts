import { getClient } from '../linear';

interface CreateArg {
  team: string;
  title: string;
}

export function parseCreateArg(encoded: string): CreateArg | null {
  if (!encoded.startsWith('create::')) return null;
  const rest = encoded.slice('create::'.length);
  const sepIdx = rest.indexOf('::');
  if (sepIdx === -1) return null;
  return {
    team: rest.slice(0, sepIdx),
    title: rest.slice(sepIdx + 2),
  };
}

export async function createIssue(encoded: string): Promise<string> {
  const parsed = parseCreateArg(encoded);
  if (!parsed) throw new Error(`Invalid create argument: ${encoded}`);

  const client = await getClient();
  const teams = await client.teams();
  const team = teams.nodes.find((t) => t.key === parsed.team.toUpperCase());

  if (!team) throw new Error(`Team ${parsed.team} not found`);

  const result = await client.createIssue({ teamId: team.id, title: parsed.title });
  const issue = await result.issue;

  if (!issue) throw new Error('Issue creation returned no issue');

  return issue.url;
}