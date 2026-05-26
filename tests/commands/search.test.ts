import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { searchIssues } from '../../src/commands/search';
import type { AlfredItem } from '../../src/alfred';

function makeMockIssue(overrides = {}) {
  return {
    id: 'abc',
    identifier: 'KIN-1',
    title: 'Fix auth bug',
    url: 'https://linear.app/kindred/issue/KIN-1',
    description: 'JWT token expires too quickly',
    updatedAt: new Date('2026-05-20'),
    state: Promise.resolve({ name: 'In Progress' }),
    assignee: Promise.resolve({ displayName: 'Adam Horner' }),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('searchIssues', () => {
  it('returns empty-result item when no issues found', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({ nodes: [] }),
    } as any);
    const items = await searchIssues('nomatch');
    expect(items).toHaveLength(1);
    expect(items[0].valid).toBe(false);
    expect(items[0].title).toContain('No results');
  });

  it('returns one item per issue', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({
        nodes: [makeMockIssue(), makeMockIssue({ identifier: 'KIN-2', id: 'def' })],
      }),
    } as any);
    const items = await searchIssues('auth');
    expect(items).toHaveLength(2);
  });

  it('enriches subtitle when single result', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue()] }),
    } as any);
    const items = await searchIssues('auth');
    expect(items[0].subtitle).toContain('JWT token');
  });

  it('uses brief subtitle when multiple results', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({
        nodes: [makeMockIssue(), makeMockIssue({ identifier: 'KIN-2', id: 'def' })],
      }),
    } as any);
    const items = await searchIssues('auth');
    expect(items[0].subtitle).not.toContain('JWT token');
    expect(items[0].subtitle).toContain('In Progress');
  });
});
