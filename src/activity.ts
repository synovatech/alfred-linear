import type { Issue, IssueHistory, User } from '@linear/sdk';

export type Lookup = <T>(key: string, fetch: () => Promise<T> | undefined) => Promise<T | undefined>;

interface ActivityItem {
  createdAt: Date;
  order: number;
  lines: string[];
}

const OLDER_NOTE = '_Older activity not shown — open in Linear for the full history_';

export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Memoises lazy fetches by key so each distinct ID is fetched once; a rejected fetch resolves to undefined. */
export function makeLookup(): Lookup {
  const memo = new Map<string, Promise<unknown>>();
  return (key, fetch) => {
    let hit = memo.get(key);
    if (!hit) {
      hit = Promise.resolve()
        .then(fetch)
        .catch(() => undefined);
      memo.set(key, hit);
    }
    return hit as Promise<any>;
  };
}

export async function actorName(
  botActor: { name?: string | null } | null | undefined,
  userId: string | undefined | null,
  fetchUser: () => Promise<User> | undefined,
  lookup: Lookup,
): Promise<string> {
  if (botActor?.name) return botActor.name;
  if (userId) {
    const user = await lookup(`user:${userId}`, fetchUser);
    return user?.displayName ?? 'Someone';
  }
  return 'Linear';
}

const PRIORITIES = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];
const priorityName = (n: number) => PRIORITIES[n] ?? `Priority ${n}`;

/** One line per recognised change in a history entry; fail-soft, so a broken entry yields no lines. */
export async function historyLines(entry: IssueHistory, lookup: Lookup): Promise<string[]> {
  try {
    const user = (id: string | null | undefined, fetch: () => Promise<User> | undefined) =>
      id ? lookup(`user:${id}`, fetch).then((u) => u?.displayName ?? 'Someone') : undefined;
    const named = <T extends { name: string }>(
      kind: string,
      id: string | null | undefined,
      fetch: () => Promise<T> | undefined,
    ) => (id ? lookup(`${kind}:${id}`, fetch).then((r) => r?.name ?? 'Unknown') : undefined);

    const [who, fromState, toState, fromAssignee, toAssignee, fromProject, toProject, attachment] =
      await Promise.all([
        actorName(entry.botActor, entry.actorId, () => entry.actor, lookup),
        named('state', entry.fromStateId, () => entry.fromState),
        named('state', entry.toStateId, () => entry.toState),
        user(entry.fromAssigneeId, () => entry.fromAssignee),
        user(entry.toAssigneeId, () => entry.toAssignee),
        named('project', entry.fromProjectId, () => entry.fromProject),
        named('project', entry.toProjectId, () => entry.toProject),
        entry.attachmentId
          ? lookup(`attachment:${entry.attachmentId}`, () => entry.attachment)
          : undefined,
      ]);

    const texts: string[] = [];
    if (toState) texts.push(fromState ? `moved from ${fromState} to ${toState}` : `moved to ${toState}`);
    if (toAssignee) {
      texts.push(fromAssignee ? `reassigned from ${fromAssignee} to ${toAssignee}` : `assigned to ${toAssignee}`);
    } else if (fromAssignee) {
      texts.push(`unassigned ${fromAssignee}`);
    }
    const labels = (verb: string, list: { name: string }[] | null | undefined) => {
      if (list?.length) {
        texts.push(`${verb} label${list.length > 1 ? 's' : ''} ${list.map((l) => l.name).join(', ')}`);
      }
    };
    labels('added', entry.addedLabels);
    labels('removed', entry.removedLabels);
    if (entry.toTitle) texts.push(`changed the title to "${truncate(entry.toTitle)}"`);
    if (entry.toPriority != null) {
      texts.push(
        entry.fromPriority != null
          ? `changed priority from ${priorityName(entry.fromPriority)} to ${priorityName(entry.toPriority)}`
          : `set priority to ${priorityName(entry.toPriority)}`,
      );
    }
    if (toProject) {
      texts.push(fromProject ? `moved from project ${fromProject} to ${toProject}` : `added to project ${toProject}`);
    } else if (fromProject) {
      texts.push(`removed from project ${fromProject}`);
    }
    for (const change of entry.relationChanges ?? []) {
      const removed = /r$/i.test(change.type) || /remove/i.test(change.type);
      texts.push(`${removed ? 'removed' : 'added'} a relation to ${change.identifier}`);
    }
    if (entry.attachmentId) {
      texts.push(attachment ? `linked [${truncate(attachment.title)}](${attachment.url})` : 'linked an attachment');
    }
    if (entry.updatedDescription) texts.push('updated the description');

    const ts = formatTimestamp(entry.createdAt);
    return texts.map((text) => `* **${who}** ${text} · ${ts}`);
  } catch {
    return [];
  }
}

export async function renderActivity(issue: Issue): Promise<string[]> {
  try {
    const [history, comments] = await Promise.all([
      issue.history({ first: 100 }),
      issue.comments({ first: 100 }),
    ]);
    const lookup = makeLookup();

    const created = async (): Promise<ActivityItem> => {
      const who = await actorName(issue.botActor, issue.creatorId, () => issue.creator, lookup);
      return {
        createdAt: issue.createdAt,
        order: 0,
        lines: [`* **${who}** created the issue · ${formatTimestamp(issue.createdAt)}`],
      };
    };

    const historyItems = history.nodes.map(async (entry, i): Promise<ActivityItem> => ({
      createdAt: entry.createdAt,
      order: 1 + i,
      lines: await historyLines(entry, lookup),
    }));

    const commentItems = comments.nodes.map(async (comment, i): Promise<ActivityItem> => {
      const who = await actorName(comment.botActor, comment.userId, () => comment.user, lookup);
      const verb = comment.parentId ? 'replied' : 'commented';
      return {
        createdAt: comment.createdAt,
        order: 1 + history.nodes.length + i,
        lines: ['', `**${who}** ${verb} · ${formatTimestamp(comment.createdAt)}`, '', comment.body, ''],
      };
    });

    const items = await Promise.all([created(), ...historyItems, ...commentItems]);
    items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.order - b.order);

    const lines = ['## Activity', ...items.flatMap((item) => item.lines)];
    if (history.pageInfo.hasNextPage || comments.pageInfo.hasNextPage) {
      lines.push('', OLDER_NOTE);
    }
    return lines;
  } catch {
    return ['## Activity', '_Activity unavailable_'];
  }
}
