import { getClient } from '../linear';

export async function getIssueDetail(identifier: string): Promise<string> {
  const client = await getClient();
  const lastDash = identifier.lastIndexOf('-');
  const teamKey = identifier.slice(0, lastDash);
  const number = parseInt(identifier.slice(lastDash + 1), 10);
  const results = await client.issues({
    filter: { number: { eq: number }, team: { key: { eq: teamKey } } },
  });
  const issue = results.nodes[0];
  if (!issue) throw new Error(`Issue ${identifier} not found`);

  const [state, assignee, team, attachmentsConn, childrenConn] = await Promise.all([
    issue.state,
    issue.assignee,
    issue.team,
    issue.attachments(),
    issue.children(),
  ]);

  const attachments = attachmentsConn?.nodes ?? [];
  const children = childrenConn?.nodes ?? [];

  const lines: string[] = [
    `# ${issue.identifier}`,
    `# ${issue.title}`,
    '',
    `* **Team:** ${team?.name ?? 'Unknown'}`,
    `* **Updated:** ${issue.updatedAt.toLocaleDateString('en-GB')}`,
    `* **Status:** ${state?.name ?? 'Unknown'}`,
    `* **Assignee:** ${assignee?.displayName ?? 'Unassigned'}`,
  ];

  if (children.length > 0) {
    lines.push('* **Sub-issues:**');
    for (const child of children) {
      lines.push(`    * ${child.identifier}: ${child.title}`);
    }
  }

  if (attachments.length > 0) {
    lines.push('* **Attachments:**');
    for (const att of attachments) {
      lines.push(`    * [${att.title}](${att.url})`);
    }
  }

  lines.push('', issue.description?.trim() || '_No description_');

  return lines.join('\n');
}
