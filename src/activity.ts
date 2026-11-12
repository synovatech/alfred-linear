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

// Task 2 fills this in.
export async function historyLines(_entry: IssueHistory, _lookup: Lookup): Promise<string[]> {
  return [];
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
