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

// Non-actionable suggestion items. `prefix` is the canonical string of the
// modifiers already chosen; each item's autocomplete rebuilds the whole chain
// so earlier filters survive a Tab-completion. Trailing space on the
// autocomplete leaves the cursor ready for the next token.

export function makeOptionPickerItem(
  option: { kind: 'flag' | 'arg'; token: string; subtitle: string; argHint?: string },
  prefix: string,
): AlfredItem {
  const subtitle = option.kind === 'arg' && option.argHint
    ? `${option.subtitle} (${option.argHint})`
    : option.subtitle;
  return {
    uid: `smart-${option.token}`,
    title: `:${option.token}`,
    subtitle,
    autocomplete: `${prefix}:${option.token} `,
    valid: false,
  };
}

export function makeTeamItem(team: { key: string; name: string }, prefix: string): AlfredItem {
  return {
    uid: `team-${team.key}`,
    title: team.key,
    subtitle: team.name,
    autocomplete: `${prefix}:team ${team.key} `,
    valid: false,
  };
}

export function makeProjectItem(project: { name: string }, prefix: string): AlfredItem {
  return {
    uid: `project-${project.name}`,
    title: project.name,
    subtitle: 'Project',
    autocomplete: `${prefix}:project "${project.name}" `,
    valid: false,
  };
}

export function makePriorityItem(choice: { label: string; value: number }, prefix: string): AlfredItem {
  return {
    uid: `priority-${choice.value}`,
    title: choice.label,
    subtitle: `Priority: ${choice.label}`,
    autocomplete: `${prefix}:priority ${choice.label} `,
    valid: false,
  };
}

export function makeDueItem(keyword: { token: string; label: string; description: string }, prefix: string): AlfredItem {
  return {
    uid: `due-${keyword.token}`,
    title: keyword.label,
    subtitle: keyword.description,
    autocomplete: `${prefix}:due ${keyword.token} `,
    valid: false,
  };
}

// Generic non-actionable item for hints and errors.
export function makeInfoItem(title: string, subtitle: string): AlfredItem {
  return { title, subtitle, valid: false };
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
