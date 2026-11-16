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

describe('history events', () => {
  const at = new Date('2026-11-05T11:00:00Z');
  const ts = '5 Nov 2026, 11:00';

  function makeEntry(overrides: Record<string, unknown> = {}) {
    return {
      createdAt: at,
      actorId: 'u-adam',
      actor: Promise.resolve({ displayName: 'Adam' }),
      botActor: null,
      ...overrides,
    };
  }

  async function eventLines(overrides: Record<string, unknown>) {
    const lines = await renderActivity(makeIssue({ history: conn([makeEntry(overrides)]) }));
    return lines
      .slice(2)
      .map((l) => l.replace('* **Adam** ', '').replace(` · ${ts}`, ''));
  }

  it('renders status changes', async () => {
    expect(
      await eventLines({
        fromStateId: 's1',
        fromState: Promise.resolve({ name: 'In Definition' }),
        toStateId: 's2',
        toState: Promise.resolve({ name: 'In Progress' }),
      }),
    ).toEqual(['moved from In Definition to In Progress']);
    expect(
      await eventLines({ toStateId: 's2', toState: Promise.resolve({ name: 'In Progress' }) }),
    ).toEqual(['moved to In Progress']);
  });

  it('shows Unknown when a state lookup fails', async () => {
    expect(
      await eventLines({ toStateId: 's2', toState: Promise.reject(new Error('x')) }),
    ).toEqual(['moved to Unknown']);
  });

  it('renders assignee changes', async () => {
    const adam = Promise.resolve({ displayName: 'Adam' });
    const jenine = Promise.resolve({ displayName: 'Jenine' });
    expect(
      await eventLines({ fromAssigneeId: 'u1', fromAssignee: adam, toAssigneeId: 'u2', toAssignee: jenine }),
    ).toEqual(['reassigned from Adam to Jenine']);
    expect(await eventLines({ toAssigneeId: 'u2', toAssignee: jenine })).toEqual(['assigned to Jenine']);
    expect(await eventLines({ fromAssigneeId: 'u1', fromAssignee: adam })).toEqual(['unassigned Adam']);
  });

  it('renders label changes', async () => {
    expect(await eventLines({ addedLabels: [{ name: 'Autofix' }] })).toEqual(['added label Autofix']);
    expect(await eventLines({ addedLabels: [{ name: 'A' }, { name: 'B' }] })).toEqual(['added labels A, B']);
    expect(await eventLines({ removedLabels: [{ name: 'Autofix' }] })).toEqual(['removed label Autofix']);
  });

  it('renders title changes, truncating long titles', async () => {
    expect(await eventLines({ fromTitle: 'Old', toTitle: 'New title' })).toEqual([
      'changed the title to "New title"',
    ]);
    expect(await eventLines({ fromTitle: 'Old', toTitle: 'a'.repeat(100) })).toEqual([
      `changed the title to "${'a'.repeat(79)}…"`,
    ]);
  });

  it('renders priority changes', async () => {
    expect(await eventLines({ fromPriority: 4, toPriority: 2 })).toEqual([
      'changed priority from Low to High',
    ]);
    expect(await eventLines({ toPriority: 1 })).toEqual(['set priority to Urgent']);
  });

  it('renders project changes', async () => {
    const alpha = Promise.resolve({ name: 'Alpha' });
    const beta = Promise.resolve({ name: 'Beta' });
    expect(
      await eventLines({ fromProjectId: 'p1', fromProject: alpha, toProjectId: 'p2', toProject: beta }),
    ).toEqual(['moved from project Alpha to Beta']);
    expect(await eventLines({ toProjectId: 'p2', toProject: beta })).toEqual(['added to project Beta']);
    expect(await eventLines({ fromProjectId: 'p1', fromProject: alpha })).toEqual([
      'removed from project Alpha',
    ]);
  });

  it('renders relation changes', async () => {
    expect(
      await eventLines({
        relationChanges: [
          { identifier: 'TCP-1', type: 'ba' },
          { identifier: 'TCP-2', type: 'br' },
        ],
      }),
    ).toEqual(['added a relation to TCP-1', 'removed a relation to TCP-2']);
  });

  it('renders linked attachments, falling back when the lookup fails', async () => {
    expect(
      await eventLines({
        attachmentId: 'a1',
        attachment: Promise.resolve({ title: 'PR #9', url: 'https://github.com/x/pull/9' }),
      }),
    ).toEqual(['linked [PR #9](https://github.com/x/pull/9)']);
    expect(
      await eventLines({ attachmentId: 'a1', attachment: Promise.reject(new Error('x')) }),
    ).toEqual(['linked an attachment']);
  });

  it('renders description updates', async () => {
    expect(await eventLines({ updatedDescription: true })).toEqual(['updated the description']);
  });

  it('renders one line per change in a multi-change entry, status first', async () => {
    const lines = await renderActivity(
      makeIssue({
        history: conn([
          makeEntry({
            toAssigneeId: 'u2',
            toAssignee: Promise.resolve({ displayName: 'Jenine' }),
            toStateId: 's2',
            toState: Promise.resolve({ name: 'Done' }),
          }),
        ]),
      }),
    );
    expect(lines.slice(2)).toEqual([
      `* **Adam** moved to Done · ${ts}`,
      `* **Adam** assigned to Jenine · ${ts}`,
    ]);
  });

  it('skips unknown history entries', async () => {
    const lines = await renderActivity(
      makeIssue({ history: conn([makeEntry({ toCycleId: 'c', toDueDate: '2026-12-01' })]) }),
    );
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).not.toContain('Unknown');
  });

  it('shows the bot name on bot events', async () => {
    const attachment = {
      attachmentId: 'a1',
      attachment: Promise.resolve({ title: 'PR', url: 'https://x' }),
    };
    const lines = await renderActivity(
      makeIssue({
        history: conn([
          makeEntry({ ...attachment, botActor: { name: 'GitHub' }, actorId: undefined, actor: undefined }),
          makeEntry({ ...attachment, botActor: null, actorId: undefined, actor: undefined }),
        ]),
      }),
    );
    expect(lines[2]).toBe(`* **GitHub** linked [PR](https://x) · ${ts}`);
    expect(lines[3]).toBe(`* **Linear** linked [PR](https://x) · ${ts}`);
  });

  it('falls back to Someone when an actor lookup fails', async () => {
    const lines = await renderActivity(
      makeIssue({
        history: conn([makeEntry({ actor: Promise.reject(new Error('x')), updatedDescription: true })]),
      }),
    );
    expect(lines[2]).toBe(`* **Someone** updated the description · ${ts}`);
  });

  it('merges events and comments oldest first', async () => {
    const comment = (h: number) =>
      makeComment({ createdAt: new Date(`2026-11-05T${h}:00:00Z`), body: `c${h}` });
    const event = (h: number) =>
      makeEntry({ createdAt: new Date(`2026-11-05T${h}:00:00Z`), updatedDescription: true });
    const text = (
      await renderActivity(
        makeIssue({
          history: conn([event(13), event(11)]),
          comments: conn([comment(12), comment(10)]),
        }),
      )
    ).join('\n');
    const order = ['c10', '5 Nov 2026, 11:00', 'c12', '5 Nov 2026, 13:00'].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('looks up each user once', async () => {
    const spy = vi.fn().mockResolvedValue({ displayName: 'Adam' });
    const entry = () => {
      const e = makeEntry({ updatedDescription: true });
      Object.defineProperty(e, 'actor', { get: spy });
      return e;
    };
    await renderActivity(makeIssue({ history: conn([entry(), entry()]) }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('drops an entry whose rendering throws without blanking the section', async () => {
    const bad = makeEntry({ toStateId: 's2' });
    Object.defineProperty(bad, 'addedLabels', {
      get() {
        throw new Error('x');
      },
    });
    const lines = await renderActivity(
      makeIssue({
        history: conn([bad, makeEntry({ updatedDescription: true })]),
        comments: conn([makeComment({ body: 'still here' })]),
      }),
    );
    const text = lines.join('\n');
    expect(text).not.toContain('moved to');
    expect(text).toContain('updated the description');
    expect(text).toContain('still here');
    expect(text).not.toContain('_Activity unavailable_');
  });

  it('uses embedded actors without fetching the actor', async () => {
    const spy = vi.fn().mockResolvedValue({ displayName: 'Other' });
    const e = makeEntry({ updatedDescription: true, actors: [{ displayName: 'Embedded' }] });
    Object.defineProperty(e, 'actor', { get: spy });
    const lines = await renderActivity(makeIssue({ history: conn([e]) }));
    expect(lines[2]).toBe(`* **Embedded** updated the description · ${ts}`);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('created line actor', () => {
  it('prefers the human creator over the bot actor', async () => {
    const lines = await renderActivity(makeIssue({ botActor: { name: 'Claude' } }));
    expect(lines[1]).toBe('* **Adam Horner** created the issue · 1 Nov 2026, 09:00');
  });
  it('shows Someone when the creator lookup fails', async () => {
    const lines = await renderActivity(makeIssue({ creator: Promise.reject(new Error('x')) }));
    expect(lines[1]).toContain('**Someone**');
  });
});
