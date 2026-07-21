export interface AlfredItem {
  uid?: string;
  title: string;
  subtitle?: string;
  arg?: string;
  valid?: boolean;
  autocomplete?: string;
  variables?: Record<string, string>;
  match?: string;
  icon?: { path?: string; type?: string };
  text?: { copy?: string; largetype?: string };
  quicklookurl?: string;
}

export interface IssueShape {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description?: string | null;
  updatedAt: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
}

export function makeSearchItem(issue: IssueShape, isSingle: boolean): AlfredItem {
  const status = issue.state?.name ?? 'Unknown';
  const assignee = issue.assignee?.displayName ?? 'Unassigned';

  const subtitle = isSingle && issue.description
    ? `${status} · ${assignee} · ${issue.description.slice(0, 80)}${issue.description.length > 80 ? '…' : ''}`
    : `${status} · ${assignee} · updated ${relativeDate(issue.updatedAt)}`;

  return {
    uid: issue.identifier,
    title: `${issue.identifier}  ${issue.title}`,
    subtitle,
    arg: issue.identifier,
    variables: { url: issue.url, issueId: issue.identifier },
    match: `${issue.identifier} ${issue.title} ${status} ${assignee}`.toLowerCase(),
  };
}

export function makeSetupItem(): AlfredItem {
  return {
    title: 'Linear: Not connected',
    subtitle: 'Press Enter to connect your Linear account',
    arg: 'setup::auth',
  };
}

export function makeCreatePreviewItem(team: string, title: string): AlfredItem {
  return {
    uid: 'create',
    title: `Create in ${team}: ${title}`,
    subtitle: 'Press Enter to create and open in Linear',
    arg: `create::${team}::${title}`,
  };
}

export function makeEmptyQueryItem(): AlfredItem {
  return {
    title: 'Search Linear issues…',
    subtitle: 'Type a search term',
    valid: false,
  };
}

export function makeSmartOptionItem(option: { token: string; subtitle: string }): AlfredItem {
  return {
    uid: `smart-${option.token}`,
    title: `:${option.token}`,
    subtitle: option.subtitle,
    // Trailing space so Tab leaves the cursor ready to type the search term.
    autocomplete: `:${option.token} `,
    valid: false,
  };
}

export function makeNoSmartOptionItem(partial: string): AlfredItem {
  return {
    title: `No smart option matches “:${partial}”`,
    subtitle: 'Remove the colon to search, or keep typing',
    valid: false,
  };
}

export function alfredOutput(items: AlfredItem[]): void {
  process.stdout.write(JSON.stringify({ items }));
}

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
