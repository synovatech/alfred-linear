import { getClient } from '../linear';

export async function getIssueDetail(identifier: string): Promise<string> {
  const client = await getClient();
  const issue = await client.issue(identifier);

  const [state, assignee, team] = await Promise.all([
    issue.state,
    issue.assignee,
    issue.team,
  ]);

  return [
    `# ${issue.identifier}: ${issue.title}`,
    '',
    `**Status:** ${state?.name ?? 'Unknown'}`,
    `**Assignee:** ${assignee?.displayName ?? 'Unassigned'}`,
    `**Team:** ${team?.name ?? 'Unknown'}`,
    `**Updated:** ${issue.updatedAt.toLocaleDateString('en-GB')}`,
    '',
    issue.description?.trim() || '_No description_',
    '',
    `[Open in Linear](${issue.url})`,
  ].join('\n');
}
