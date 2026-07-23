import { describe, it, expect } from 'vitest';
import { tokenize, assembleFilter, parseQuery } from '../src/query';
import { resolveOption } from '../src/smartOptions';

const ACTIVE = { state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } } };
const mod = (token: string, value?: string) => ({ option: resolveOption(token)!, value });

describe('tokenize', () => {
  it('splits on spaces and reports no trailing space', () => {
    const { tokens, trailingSpace } = tokenize('a b c');
    expect(tokens.map((t) => t.value)).toEqual(['a', 'b', 'c']);
    expect(trailingSpace).toBe(false);
  });

  it('reports a trailing space', () => {
    expect(tokenize('a b ').trailingSpace).toBe(true);
  });

  it('treats a quoted span as one token, stripping the quotes', () => {
    const { tokens } = tokenize(':project "Mobile App Q3" x');
    expect(tokens.map((t) => t.value)).toEqual([':project', 'Mobile App Q3', 'x']);
    expect(tokens[1].quoted).toBe(true);
    expect(tokens[1].openQuote).toBe(false);
  });

  it('flags an unclosed quote and keeps the partial', () => {
    const { tokens } = tokenize(':project "Mob');
    expect(tokens[1].value).toBe('Mob');
    expect(tokens[1].openQuote).toBe(true);
  });

  it('records token start offsets for term slicing', () => {
    const { tokens } = tokenize(':mine fix bug');
    expect('  :mine fix bug'.slice(2 + tokens[1].start)).toBe('fix bug');
  });
});

describe('assembleFilter', () => {
  it('applies the active-state default when no state option is present', () => {
    expect(assembleFilter([])).toEqual(ACTIVE);
    expect(assembleFilter([mod('mine')])).toEqual({ assignee: { isMe: { eq: true } }, ...ACTIVE });
  });

  it(':all clears state so no default is applied', () => {
    expect(assembleFilter([mod('all')])).toEqual({});
  });

  it(':done sets completed state', () => {
    expect(assembleFilter([mod('done')])).toEqual({ state: { type: { eq: 'completed' } } });
  });

  it('resolves conflicting state options last-wins', () => {
    expect(assembleFilter([mod('done'), mod('all')])).toEqual({});
    expect(assembleFilter([mod('all'), mod('done')])).toEqual({ state: { type: { eq: 'completed' } } });
  });

  it('ANDs all dimensions together', () => {
    const f = assembleFilter([mod('team', 'ENG'), mod('mine'), mod('priority', 'High')]);
    expect(f).toEqual({
      team: { key: { eq: 'ENG' } },
      assignee: { isMe: { eq: true } },
      priority: { eq: 2 },
      ...ACTIVE,
    });
  });
});

describe('parseQuery — modes', () => {
  it('empty / create / plain search', () => {
    expect(parseQuery('')).toEqual({ mode: 'empty' });
    expect(parseQuery('   ')).toEqual({ mode: 'empty' });
    expect(parseQuery('+KIN Fix bug')).toEqual({ mode: 'create', team: 'KIN', title: 'Fix bug' });
    expect(parseQuery('fix auth bug')).toEqual({ mode: 'search', term: 'fix auth bug', filter: ACTIVE });
  });
});

describe('parseQuery — option picker', () => {
  it('bare colon lists all options', () => {
    expect(parseQuery(':')).toEqual({ mode: 'suggest', source: 'options', partial: '', prefix: '' });
  });

  it('a partial with no trailing space stays in the option picker', () => {
    expect(parseQuery(':pro')).toMatchObject({ mode: 'suggest', source: 'options', partial: 'pro' });
    expect(parseQuery(':m')).toMatchObject({ mode: 'suggest', source: 'options', partial: 'm' });
  });

  it('an ambiguous token even with a trailing space keeps offering the picker', () => {
    expect(parseQuery(':p ')).toMatchObject({ mode: 'suggest', source: 'options', partial: 'p' });
  });

  it('an unknown token with no space shows the picker (caller renders no-match)', () => {
    expect(parseQuery(':zzz')).toMatchObject({ mode: 'suggest', source: 'options', partial: 'zzz' });
  });

  it('an unknown token followed by a space falls through to a literal search', () => {
    expect(parseQuery(':zzz ')).toEqual({ mode: 'search', term: ':zzz', filter: ACTIVE });
  });
});

describe('parseQuery — flag options', () => {
  it(':all <term> searches every state', () => {
    expect(parseQuery(':all fix')).toEqual({ mode: 'search', term: 'fix', filter: {} });
  });

  it(':mine with a trailing space and no term is a browse/list', () => {
    expect(parseQuery(':mine ')).toEqual({ mode: 'list', filter: { assignee: { isMe: { eq: true } }, ...ACTIVE } });
  });

  it(':done <term> searches completed', () => {
    expect(parseQuery(':done fix')).toEqual({ mode: 'search', term: 'fix', filter: { state: { type: { eq: 'completed' } } } });
  });

  it('resolves a flag by unique prefix', () => {
    expect(parseQuery(':m fix')).toEqual({ mode: 'search', term: 'fix', filter: { assignee: { isMe: { eq: true } }, ...ACTIVE } });
  });
});

describe('parseQuery — team option', () => {
  it(':team with trailing space suggests teams', () => {
    expect(parseQuery(':team ')).toEqual({ mode: 'suggest', source: 'teams', partial: '', prefix: '' });
  });

  it('suggests teams filtered by the partial being typed', () => {
    expect(parseQuery(':team EN')).toEqual({ mode: 'suggest', source: 'teams', partial: 'EN', prefix: '' });
  });

  it('a completed team with no term browses that team', () => {
    expect(parseQuery(':team ENG ')).toEqual({ mode: 'list', filter: { team: { key: { eq: 'ENG' } }, ...ACTIVE } });
  });

  it('a completed team with a term searches within it', () => {
    expect(parseQuery(':team ENG login bug')).toEqual({ mode: 'search', term: 'login bug', filter: { team: { key: { eq: 'ENG' } }, ...ACTIVE } });
  });
});

describe('parseQuery — project option (composition + scoping)', () => {
  it('scopes project suggestions to an already-chosen team, carrying the prefix', () => {
    expect(parseQuery(':team ENG :proj ')).toEqual({
      mode: 'suggest',
      source: 'projects',
      partial: '',
      prefix: ':team ENG ',
      teamKey: 'ENG',
    });
  });

  it('suggests projects on an open quote, keeping the partial', () => {
    expect(parseQuery(':project "Mob')).toEqual({ mode: 'suggest', source: 'projects', partial: 'Mob', prefix: '', teamKey: undefined });
  });

  it('searches within a quoted project name', () => {
    expect(parseQuery(':project "Mobile App" fix')).toEqual({
      mode: 'search',
      term: 'fix',
      filter: { project: { name: { eq: 'Mobile App' } }, ...ACTIVE },
    });
  });
});

describe('parseQuery — priority option', () => {
  it('suggests priority levels', () => {
    expect(parseQuery(':priority ')).toEqual({ mode: 'suggest', source: 'priority', partial: '', prefix: '' });
  });

  it('searches by priority', () => {
    expect(parseQuery(':priority High fix')).toEqual({ mode: 'search', term: 'fix', filter: { priority: { eq: 2 }, ...ACTIVE } });
  });
});

describe('parseQuery — due option', () => {
  it('suggests due keywords after ":due "', () => {
    expect(parseQuery(':due ')).toEqual({ mode: 'suggest', source: 'due', partial: '', prefix: '' });
  });

  it('suggests while a keyword/date is being typed', () => {
    expect(parseQuery(':due over')).toEqual({ mode: 'suggest', source: 'due', partial: 'over', prefix: '' });
  });

  it('searches by an explicit due date', () => {
    expect(parseQuery(':due 2026-07-01 fix')).toEqual({
      mode: 'search',
      term: 'fix',
      filter: { dueDate: { eq: '2026-07-01' }, ...ACTIVE },
    });
  });

  it('maps the < operator to an exclusive before-filter', () => {
    expect(parseQuery(':due <2026-07-01 fix')).toEqual({
      mode: 'search',
      term: 'fix',
      filter: { dueDate: { lt: '2026-07-01' }, ...ACTIVE },
    });
  });

  it('browses (list mode) for a completed due filter with no term', () => {
    expect(parseQuery(':due 2026-07-01 ')).toEqual({
      mode: 'list',
      filter: { dueDate: { eq: '2026-07-01' }, ...ACTIVE },
    });
  });

  it('applies a keyword filter (smoke — value depends on today)', () => {
    const parsed = parseQuery(':due overdue fix');
    expect(parsed).toMatchObject({ mode: 'search', term: 'fix' });
    expect((parsed as any).filter.dueDate.lt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('errors on an unparseable due value', () => {
    expect(parseQuery(':due notadate x')).toEqual({ mode: 'error', message: 'Unrecognized date: notadate' });
    expect(parseQuery(':due notadate ')).toMatchObject({ mode: 'error' });
  });
});

describe('parseQuery — full composition', () => {
  it('combines team, mine, and priority with a search term', () => {
    expect(parseQuery(':team ENG :mine :priority High fix bug')).toEqual({
      mode: 'search',
      term: 'fix bug',
      filter: {
        team: { key: { eq: 'ENG' } },
        assignee: { isMe: { eq: true } },
        priority: { eq: 2 },
        ...ACTIVE,
      },
    });
  });
});
