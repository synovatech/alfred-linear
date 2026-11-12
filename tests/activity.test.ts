import { describe, it, expect, vi } from 'vitest';
import { formatTimestamp, truncate, renderActivity } from '../src/activity';

const empty = () => vi.fn().mockResolvedValue({ nodes: [], pageInfo: { hasNextPage: false } });

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date('2026-11-01T09:00:00Z'),
    creator: Promise.resolve({ displayName: 'Adam Horner' }),
    creatorId: 'u-adam',
    botActor: null,
    history: empty(),
    comments: empty(),
    ...overrides,
  } as any;
}

function conn(nodes: unknown[], hasNextPage = false) {
  return vi.fn().mockResolvedValue({ nodes, pageInfo: { hasNextPage } });
}

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date('2026-11-02T10:00:00Z'),
    body: 'Hello',
    userId: 'u-1',
    user: Promise.resolve({ displayName: 'Jenine' }),
    parentId: null,
    botActor: null,
    ...overrides,
  };
}

describe('formatTimestamp', () => {
  it('formats day, short month, year and 24h time', () => {
    expect(formatTimestamp(new Date('2026-11-12T14:05:00Z'))).toBe('12 Nov 2026, 14:05');
  });
});

describe('truncate', () => {
  it('shortens values over the limit to 80 chars with an ellipsis', () => {
    const out = truncate('a'.repeat(81));
    expect(out).toBe('a'.repeat(79) + '…');
    expect(out).toHaveLength(80);
  });
  it('leaves short and exactly-80-char values unchanged', () => {
    expect(truncate('short')).toBe('short');
    expect(truncate('a'.repeat(80))).toBe('a'.repeat(80));
  });
});

describe('renderActivity', () => {
  it('renders only the created line when there is no activity', async () => {
    expect(await renderActivity(makeIssue())).toEqual([
      '## Activity',
      '* **Adam Horner** created the issue · 1 Nov 2026, 09:00',
    ]);
  });

  it('uses Linear for the creator when there is no user or bot, and the bot name when present', async () => {
    const none = await renderActivity(makeIssue({ creator: undefined, creatorId: undefined }));
    expect(none[1]).toBe('* **Linear** created the issue · 1 Nov 2026, 09:00');
    const bot = await renderActivity(
      makeIssue({ creator: undefined, creatorId: undefined, botActor: { name: 'GitHub' } }),
    );
    expect(bot[1]).toBe('* **GitHub** created the issue · 1 Nov 2026, 09:00');
  });

  it('shows comments with author, timestamp and body', async () => {
    const body = 'Looks good\n\n## Heading\n- item';
    const lines = await renderActivity(makeIssue({ comments: conn([makeComment({ body })]) }));
    expect(lines.join('\n')).toContain(
      '\n\n**Jenine** commented · 2 Nov 2026, 10:00\n\nLooks good\n\n## Heading\n- item\n',
    );
    expect(lines[2]).toBe('');
  });

  it('marks replies', async () => {
    const lines = await renderActivity(
      makeIssue({ comments: conn([makeComment({ parentId: 'c-1' })]) }),
    );
    expect(lines.join('\n')).toContain('**Jenine** replied · ');
  });

  it('shows the bot name on bot comments, never Unknown', async () => {
    const bot = makeComment({ botActor: { name: 'Autofix' }, user: undefined, userId: undefined });
    const none = makeComment({ botActor: null, user: undefined, userId: undefined });
    const out = (await renderActivity(makeIssue({ comments: conn([bot, none]) }))).join('\n');
    expect(out).toContain('**Autofix** commented');
    expect(out).toContain('**Linear** commented');
    expect(out).not.toContain('Unknown');
  });

  it('renders Someone when a human user lookup fails', async () => {
    const c = makeComment({ user: Promise.reject(new Error('x')) });
    const out = (await renderActivity(makeIssue({ comments: conn([c]) }))).join('\n');
    expect(out).toContain('**Someone** commented');
  });

  it('orders comments oldest first', async () => {
    const late = makeComment({ createdAt: new Date('2026-11-02T12:00:00Z'), body: 'late' });
    const early = makeComment({ createdAt: new Date('2026-11-02T10:00:00Z'), body: 'early' });
    const out = (await renderActivity(makeIssue({ comments: conn([late, early]) }))).join('\n');
    expect(out.indexOf('created the issue')).toBeLessThan(out.indexOf('early'));
    expect(out.indexOf('early')).toBeLessThan(out.indexOf('late'));
  });

  it('keeps the created line first on a timestamp tie', async () => {
    const tie = makeComment({ createdAt: new Date('2026-11-01T09:00:00Z') });
    const lines = await renderActivity(makeIssue({ comments: conn([tie]) }));
    expect(lines[1]).toContain('created the issue');
  });

  it('shows Activity unavailable when history or comments fail', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await renderActivity(makeIssue({ history: bad }))).toEqual([
      '## Activity',
      '_Activity unavailable_',
    ]);
    expect(await renderActivity(makeIssue({ comments: bad }))).toEqual([
      '## Activity',
      '_Activity unavailable_',
    ]);
  });

  it('notes older activity when history or comments have more pages', async () => {
    const note = '_Older activity not shown — open in Linear for the full history_';
    for (const o of [{ history: conn([], true) }, { comments: conn([], true) }]) {
      const lines = await renderActivity(makeIssue(o));
      expect(lines.at(-1)).toBe(note);
      expect(lines.at(-2)).toBe('');
    }
  });

  it('fetches 100 of each', async () => {
    const issue = makeIssue();
    await renderActivity(issue);
    expect(issue.history).toHaveBeenCalledWith({ first: 100 });
    expect(issue.comments).toHaveBeenCalledWith({ first: 100 });
  });
});
