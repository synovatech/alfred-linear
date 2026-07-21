import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/auth', () => ({
  readTokens: vi.fn(),
  startOAuthFlow: vi.fn(),
  DEFAULT_AUTH_FILE: '/tmp/test-auth.json',
}));
vi.mock('../src/commands/search', () => ({ searchIssues: vi.fn() }));
vi.mock('../src/commands/detail', () => ({ getIssueDetail: vi.fn() }));
vi.mock('../src/commands/create', () => ({ createIssue: vi.fn() }));
vi.mock('../src/alfred', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/alfred')>();
  return { ...actual, alfredOutput: vi.fn() };
});

import { readTokens } from '../src/auth';
import { searchIssues } from '../src/commands/search';
import { getIssueDetail } from '../src/commands/detail';
import { createIssue } from '../src/commands/create';
import { alfredOutput, makeSetupItem, makeCreatePreviewItem } from '../src/alfred';
import { parseQuery, runMain } from '../src/index';

const validTokens = {
  access_token: 'tok',
  refresh_token: 'ref',
  expires_at: Date.now() + 3600_000,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('parseQuery', () => {
  it('returns search mode for plain text (active-only by default)', () => {
    expect(parseQuery('fix auth bug')).toEqual({ mode: 'search', query: 'fix auth bug', includeAll: false });
  });

  it('returns create mode for +TEAM prefix', () => {
    expect(parseQuery('+KIN Fix auth bug')).toEqual({ mode: 'create', team: 'KIN', title: 'Fix auth bug' });
  });

  it('returns empty mode for blank query', () => {
    expect(parseQuery('')).toEqual({ mode: 'empty' });
    expect(parseQuery('  ')).toEqual({ mode: 'empty' });
  });

  it('returns search mode for lowercase input even if first word is uppercase-ish', () => {
    expect(parseQuery('fix KIN bug')).toEqual({ mode: 'search', query: 'fix KIN bug', includeAll: false });
  });

  it('create pattern requires at least one title word after team', () => {
    expect(parseQuery('+KIN')).toEqual({ mode: 'search', query: '+KIN', includeAll: false });
  });
});

describe('parseQuery — smart options', () => {
  it('enters picker mode for a bare colon', () => {
    expect(parseQuery(':')).toEqual({ mode: 'smartOptions', partial: '' });
  });

  it('enters picker mode while the token is still being typed', () => {
    expect(parseQuery(':a')).toEqual({ mode: 'smartOptions', partial: 'a' });
    expect(parseQuery(':all')).toEqual({ mode: 'smartOptions', partial: 'all' });
  });

  it('picker mode carries an unknown partial through for the caller to reject', () => {
    expect(parseQuery(':zzz')).toEqual({ mode: 'smartOptions', partial: 'zzz' });
  });

  it('searches all states for :all followed by a term', () => {
    expect(parseQuery(':all fix login bug')).toEqual({ mode: 'search', query: 'fix login bug', includeAll: true });
  });

  it('is case-insensitive on the token', () => {
    expect(parseQuery(':ALL fix')).toEqual({ mode: 'search', query: 'fix', includeAll: true });
  });

  it('stays in picker mode for :all with no search term (trailing space is trimmed)', () => {
    expect(parseQuery(':all ')).toEqual({ mode: 'smartOptions', partial: 'all' });
  });

  it('falls through to a literal search for an unknown token followed by a term', () => {
    expect(parseQuery(':allowance stuff')).toEqual({ mode: 'search', query: ':allowance stuff', includeAll: false });
  });
});

describe('runMain (--detail / --create unauthenticated)', () => {
  it('--detail writes a markdown message when not authenticated', async () => {
    vi.mocked(readTokens).mockReturnValue(null);
    const written: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((d) => { written.push(String(d)); return true; });
    await runMain(['--detail', 'KIN-1']);
    spy.mockRestore();
    expect(written.join('')).toContain('Not connected');
    expect(getIssueDetail).not.toHaveBeenCalled();
  });

  it('--create outputs setup item when not authenticated', async () => {
    vi.mocked(readTokens).mockReturnValue(null);
    await runMain(['--create', 'create::KIN::title']);
    expect(alfredOutput).toHaveBeenCalledWith([makeSetupItem()]);
    expect(createIssue).not.toHaveBeenCalled();
  });
});

describe('runMain (script filter mode)', () => {
  it('outputs setup item when not authenticated', async () => {
    vi.mocked(readTokens).mockReturnValue(null);
    await runMain([]);
    expect(alfredOutput).toHaveBeenCalledWith([makeSetupItem()]);
  });

  it('calls searchIssues active-only for a plain query', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    vi.mocked(searchIssues).mockResolvedValue([{ title: 'KIN-1  Fix auth', arg: 'KIN-1' }]);
    await runMain(['fix auth']);
    expect(searchIssues).toHaveBeenCalledWith('fix auth', false);
    expect(alfredOutput).toHaveBeenCalled();
  });

  it('calls searchIssues with includeAll for an :all query', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    vi.mocked(searchIssues).mockResolvedValue([]);
    await runMain([':all fix auth']);
    expect(searchIssues).toHaveBeenCalledWith('fix auth', true);
  });

  it('outputs smart-option picker items for a colon prefix', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    await runMain([':']);
    expect(searchIssues).not.toHaveBeenCalled();
    const items = vi.mocked(alfredOutput).mock.calls[0][0];
    expect(items.some((i) => i.title === ':all')).toBe(true);
  });

  it('outputs a no-match item for an unknown colon token still being typed', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    await runMain([':zzz']);
    const items = vi.mocked(alfredOutput).mock.calls[0][0];
    expect(items).toHaveLength(1);
    expect(items[0].valid).toBe(false);
    expect(items[0].title).toContain('zzz');
  });

  it('outputs create preview for +TEAM query', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    await runMain(['+KIN Fix auth bug']);
    expect(alfredOutput).toHaveBeenCalledWith([makeCreatePreviewItem('KIN', 'Fix auth bug')]);
    expect(searchIssues).not.toHaveBeenCalled();
  });
});
