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
  it('returns search mode for plain text', () => {
    expect(parseQuery('fix auth bug')).toEqual({ mode: 'search', query: 'fix auth bug' });
  });

  it('returns create mode for +TEAM prefix', () => {
    expect(parseQuery('+KIN Fix auth bug')).toEqual({ mode: 'create', team: 'KIN', title: 'Fix auth bug' });
  });

  it('returns empty mode for blank query', () => {
    expect(parseQuery('')).toEqual({ mode: 'empty' });
    expect(parseQuery('  ')).toEqual({ mode: 'empty' });
  });

  it('returns search mode for lowercase input even if first word is uppercase-ish', () => {
    expect(parseQuery('fix KIN bug')).toEqual({ mode: 'search', query: 'fix KIN bug' });
  });

  it('create pattern requires at least one title word after team', () => {
    expect(parseQuery('+KIN')).toEqual({ mode: 'search', query: '+KIN' });
  });
});

describe('runMain (script filter mode)', () => {
  it('outputs setup item when not authenticated', async () => {
    vi.mocked(readTokens).mockReturnValue(null);
    await runMain([]);
    expect(alfredOutput).toHaveBeenCalledWith([makeSetupItem()]);
  });

  it('calls searchIssues and outputs results for plain query', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    vi.mocked(searchIssues).mockResolvedValue([{ title: 'KIN-1  Fix auth', arg: 'KIN-1' }]);
    await runMain(['fix auth']);
    expect(searchIssues).toHaveBeenCalledWith('fix auth');
    expect(alfredOutput).toHaveBeenCalled();
  });

  it('outputs create preview for +TEAM query', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    await runMain(['+KIN Fix auth bug']);
    expect(alfredOutput).toHaveBeenCalledWith([makeCreatePreviewItem('KIN', 'Fix auth bug')]);
    expect(searchIssues).not.toHaveBeenCalled();
  });
});
