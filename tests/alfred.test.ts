import { describe, it, expect } from 'vitest';
import {
  makeSearchItem,
  makeSetupItem,
  makeCreatePreviewItem,
  makeEmptyQueryItem,
  makeOptionPickerItem,
  makeTeamItem,
  makeProjectItem,
  makePriorityItem,
  makeDueItem,
  makeInfoItem,
  makeNoSmartOptionItem,
  alfredOutput,
} from '../src/alfred';
import { resolveOption } from '../src/smartOptions';

describe('makeSearchItem', () => {
  const issue = {
    id: 'abc',
    identifier: 'KIN-1',
    title: 'Fix auth bug',
    url: 'https://linear.app/kindred/issue/KIN-1',
    description: 'JWT token expires too quickly in the middleware',
    updatedAt: '2026-05-20T10:00:00.000Z',
    state: { name: 'In Progress' },
    assignee: { displayName: 'Adam Horner' },
  };

  it('sets uid to identifier', () => {
    const item = makeSearchItem(issue, false);
    expect(item.uid).toBe('KIN-1');
  });

  it('formats title with identifier and issue title', () => {
    const item = makeSearchItem(issue, false);
    expect(item.title).toBe('KIN-1  Fix auth bug');
  });

  it('sets arg to identifier', () => {
    const item = makeSearchItem(issue, false);
    expect(item.arg).toBe('KIN-1');
  });

  it('carries url and issueId in variables', () => {
    const item = makeSearchItem(issue, false);
    expect(item.variables?.url).toBe('https://linear.app/kindred/issue/KIN-1');
    expect(item.variables?.issueId).toBe('KIN-1');
  });

  it('multi-result subtitle shows status, assignee, and relative date', () => {
    const item = makeSearchItem(issue, false);
    expect(item.subtitle).toContain('In Progress');
    expect(item.subtitle).toContain('Adam Horner');
  });

  it('single-result subtitle shows description excerpt instead of date', () => {
    const item = makeSearchItem(issue, true);
    expect(item.subtitle).toContain('JWT token expires');
  });

  it('single-result subtitle truncates description at 80 chars', () => {
    const longDesc = 'A'.repeat(120);
    const item = makeSearchItem({ ...issue, description: longDesc }, true);
    expect(item.subtitle!.length).toBeLessThan(130);
    expect(item.subtitle).toContain('…');
  });
});

describe('makeSetupItem', () => {
  it('returns item with setup::auth arg', () => {
    const item = makeSetupItem();
    expect(item.arg).toBe('setup::auth');
    expect(item.title).toContain('Not connected');
  });
});

describe('makeCreatePreviewItem', () => {
  it('encodes team and title into arg', () => {
    const item = makeCreatePreviewItem('KIN', 'Fix auth bug');
    expect(item.arg).toBe('create::KIN::Fix auth bug');
    expect(item.title).toContain('KIN');
    expect(item.title).toContain('Fix auth bug');
  });
});

describe('makeEmptyQueryItem', () => {
  it('returns a non-actionable prompt item', () => {
    const item = makeEmptyQueryItem();
    expect(item.valid).toBe(false);
  });
});

describe('makeOptionPickerItem', () => {
  it('renders a flag option: :token title, prefix-preserving autocomplete, non-actionable', () => {
    const item = makeOptionPickerItem(resolveOption('mine')!, '');
    expect(item.title).toBe(':mine');
    expect(item.autocomplete).toBe(':mine ');
    expect(item.valid).toBe(false);
    expect(item.subtitle).toContain('assigned to me');
  });

  it('shows the arg hint for an arg option and preserves an existing prefix', () => {
    const item = makeOptionPickerItem(resolveOption('team')!, ':mine ');
    expect(item.title).toBe(':team');
    expect(item.subtitle).toContain('KEY');
    expect(item.autocomplete).toBe(':mine :team ');
  });
});

describe('makeTeamItem', () => {
  it('shows key + name and autocompletes the whole chain', () => {
    const item = makeTeamItem({ key: 'ENG', name: 'Engineering' }, ':mine ');
    expect(item.title).toBe('ENG');
    expect(item.subtitle).toBe('Engineering');
    expect(item.autocomplete).toBe(':mine :team ENG ');
    expect(item.valid).toBe(false);
  });
});

describe('makeProjectItem', () => {
  it('quotes the project name in the autocomplete, carrying the team prefix', () => {
    const item = makeProjectItem({ name: 'Mobile App Q3' }, ':team ENG ');
    expect(item.title).toBe('Mobile App Q3');
    expect(item.autocomplete).toBe(':team ENG :project "Mobile App Q3" ');
    expect(item.valid).toBe(false);
  });
});

describe('makePriorityItem', () => {
  it('titles the level and autocompletes the token', () => {
    const item = makePriorityItem({ label: 'High', value: 2 }, '');
    expect(item.title).toBe('High');
    expect(item.autocomplete).toBe(':priority High ');
    expect(item.valid).toBe(false);
  });
});

describe('makeDueItem', () => {
  it('shows the label, inserts the hyphenated token, and carries the prefix', () => {
    const item = makeDueItem({ token: 'last-week', label: 'Last week', description: 'Due last week' }, ':mine ');
    expect(item.title).toBe('Last week');
    expect(item.subtitle).toBe('Due last week');
    expect(item.autocomplete).toBe(':mine :due last-week ');
    expect(item.valid).toBe(false);
  });
});

describe('makeInfoItem', () => {
  it('is a non-actionable title/subtitle item', () => {
    const item = makeInfoItem('Unrecognized date', 'Try 2026-07-01');
    expect(item.title).toBe('Unrecognized date');
    expect(item.valid).toBe(false);
  });
});

describe('makeNoSmartOptionItem', () => {
  it('names the unmatched partial and is non-actionable', () => {
    const item = makeNoSmartOptionItem('zzz');
    expect(item.title).toContain('zzz');
    expect(item.valid).toBe(false);
  });
});

describe('alfredOutput', () => {
  it('serialises items array to JSON on stdout', () => {
    const written: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (data: any) => { written.push(String(data)); return true; };

    alfredOutput([makeSetupItem()]);

    process.stdout.write = originalWrite;
    const parsed = JSON.parse(written.join(''));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].arg).toBe('setup::auth');
  });
});
