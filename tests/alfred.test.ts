import { describe, it, expect } from 'vitest';
import {
  makeSearchItem,
  makeSetupItem,
  makeCreatePreviewItem,
  makeEmptyQueryItem,
  makeSmartOptionItem,
  makeNoSmartOptionItem,
  alfredOutput,
} from '../src/alfred';

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

describe('makeSmartOptionItem', () => {
  const option = { token: 'all', subtitle: 'Search all tickets' };

  it('titles the item with the colon-prefixed token', () => {
    expect(makeSmartOptionItem(option).title).toBe(':all');
  });

  it('carries the registry subtitle', () => {
    expect(makeSmartOptionItem(option).subtitle).toBe('Search all tickets');
  });

  it('autocompletes to the token plus a trailing space so the user keeps typing', () => {
    expect(makeSmartOptionItem(option).autocomplete).toBe(':all ');
  });

  it('is not actionable on its own (Tab-complete only, no Enter)', () => {
    expect(makeSmartOptionItem(option).valid).toBe(false);
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
