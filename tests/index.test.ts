import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/auth', () => ({
  readTokens: vi.fn(),
  startOAuthFlow: vi.fn(),
  DEFAULT_AUTH_FILE: '/tmp/test-auth.json',
}));
vi.mock('../src/commands/search', () => ({ searchIssues: vi.fn(), listIssues: vi.fn() }));
vi.mock('../src/commands/detail', () => ({ getIssueDetail: vi.fn() }));
vi.mock('../src/commands/create', () => ({ createIssue: vi.fn() }));
vi.mock('../src/commands/lookups', () => ({ fetchTeams: vi.fn(), fetchProjects: vi.fn() }));
vi.mock('../src/alfred', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/alfred')>();
  return { ...actual, alfredOutput: vi.fn() };
});

import { readTokens } from '../src/auth';
import { searchIssues, listIssues } from '../src/commands/search';
import { getIssueDetail } from '../src/commands/detail';
import { createIssue } from '../src/commands/create';
import { fetchTeams, fetchProjects } from '../src/commands/lookups';
import { alfredOutput, makeSetupItem, makeCreatePreviewItem } from '../src/alfred';
import { runMain } from '../src/index';

const ACTIVE = { state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } } };
const validTokens = { access_token: 'tok', refresh_token: 'ref', expires_at: Date.now() + 3600_000 };
const lastItems = () => vi.mocked(alfredOutput).mock.calls[0][0];

beforeEach(() => { vi.clearAllMocks(); });

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

describe('runMain (script filter dispatch)', () => {
  beforeEach(() => { vi.mocked(readTokens).mockReturnValue(validTokens); });

  it('outputs setup item when not authenticated', async () => {
    vi.mocked(readTokens).mockReturnValue(null);
    await runMain([]);
    expect(alfredOutput).toHaveBeenCalledWith([makeSetupItem()]);
  });

  it('searches with the assembled filter for a plain query', async () => {
    vi.mocked(searchIssues).mockResolvedValue([{ title: 'KIN-1', arg: 'KIN-1' }]);
    await runMain(['fix auth']);
    expect(searchIssues).toHaveBeenCalledWith('fix auth', ACTIVE);
  });

  it('searches every state for an :all query', async () => {
    vi.mocked(searchIssues).mockResolvedValue([]);
    await runMain([':all fix auth']);
    expect(searchIssues).toHaveBeenCalledWith('fix auth', {});
  });

  it('lists issues for a filter-only query', async () => {
    vi.mocked(listIssues).mockResolvedValue([]);
    await runMain([':mine ']);
    expect(listIssues).toHaveBeenCalledWith({ assignee: { isMe: { eq: true } }, ...ACTIVE });
    expect(searchIssues).not.toHaveBeenCalled();
  });

  it('outputs create preview for +TEAM query', async () => {
    await runMain(['+KIN Fix auth bug']);
    expect(alfredOutput).toHaveBeenCalledWith([makeCreatePreviewItem('KIN', 'Fix auth bug')]);
    expect(searchIssues).not.toHaveBeenCalled();
  });

  it('offers the option picker for a bare colon', async () => {
    await runMain([':']);
    expect(searchIssues).not.toHaveBeenCalled();
    expect(lastItems().some((i) => i.title === ':all')).toBe(true);
    expect(lastItems().some((i) => i.title === ':priority')).toBe(true);
  });

  it('outputs a no-match item for an unknown token being typed', async () => {
    await runMain([':zzz']);
    expect(lastItems()).toHaveLength(1);
    expect(lastItems()[0].valid).toBe(false);
    expect(lastItems()[0].title).toContain('zzz');
  });

  it('fetches and renders team suggestions after ":team "', async () => {
    vi.mocked(fetchTeams).mockResolvedValue([{ key: 'ENG', name: 'Engineering' }]);
    await runMain([':team ']);
    expect(fetchTeams).toHaveBeenCalledWith('');
    expect(lastItems()[0].title).toBe('ENG');
  });

  it('fetches team-scoped project suggestions carrying the prefix', async () => {
    vi.mocked(fetchProjects).mockResolvedValue([{ name: 'Mobile App Q3' }]);
    await runMain([':team ENG :proj ']);
    expect(fetchProjects).toHaveBeenCalledWith('', 'ENG');
    expect(lastItems()[0].autocomplete).toBe(':team ENG :project "Mobile App Q3" ');
  });

  it('renders static priority choices after ":priority "', async () => {
    await runMain([':priority ']);
    expect(lastItems().map((i) => i.title)).toEqual(['Urgent', 'High', 'Medium', 'Low', 'None']);
  });

  it('renders due keywords plus a format hint after ":due "', async () => {
    await runMain([':due ']);
    const titles = lastItems().map((i) => i.title);
    expect(titles).toContain('Today');
    expect(titles).toContain('Overdue');
    expect(titles[titles.length - 1]).toBe('Or type a date');
  });

  it('outputs an error item for an unparseable due value', async () => {
    await runMain([':due notadate x']);
    expect(lastItems()).toHaveLength(1);
    expect(lastItems()[0].valid).toBe(false);
    expect(lastItems()[0].title).toContain('notadate');
    expect(searchIssues).not.toHaveBeenCalled();
  });
});
