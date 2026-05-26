import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { createIssue, parseCreateArg } from '../../src/commands/create';

beforeEach(() => { vi.clearAllMocks(); });

describe('parseCreateArg', () => {
  it('extracts team and title from encoded arg', () => {
    const result = parseCreateArg('create::KIN::Fix auth bug');
    expect(result).toEqual({ team: 'KIN', title: 'Fix auth bug' });
  });

  it('handles titles containing double colons', () => {
    const result = parseCreateArg('create::KIN::Fix::colons::in title');
    expect(result).toEqual({ team: 'KIN', title: 'Fix::colons::in title' });
  });

  it('returns null for malformed arg', () => {
    expect(parseCreateArg('create::KIN')).toBeNull();
    expect(parseCreateArg('notcreate::KIN::title')).toBeNull();
  });
});

describe('createIssue', () => {
  it('resolves team by key and creates issue', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      issue: Promise.resolve({ url: 'https://linear.app/kindred/issue/KIN-2' }),
    });
    vi.mocked(getClient).mockResolvedValue({
      teams: vi.fn().mockResolvedValue({
        nodes: [{ id: 'team-id-1', key: 'KIN' }],
      }),
      createIssue: mockCreate,
    } as any);

    const url = await createIssue('create::KIN::Fix auth bug');
    expect(mockCreate).toHaveBeenCalledWith({ teamId: 'team-id-1', title: 'Fix auth bug' });
    expect(url).toBe('https://linear.app/kindred/issue/KIN-2');
  });

  it('throws when team key is not found', async () => {
    vi.mocked(getClient).mockResolvedValue({
      teams: vi.fn().mockResolvedValue({ nodes: [{ id: 'x', key: 'TCP' }] }),
    } as any);
    await expect(createIssue('create::KIN::title')).rejects.toThrow('Team KIN not found');
  });

  it('throws for malformed encoded arg', async () => {
    await expect(createIssue('create::KIN')).rejects.toThrow('Invalid create argument');
  });
});
