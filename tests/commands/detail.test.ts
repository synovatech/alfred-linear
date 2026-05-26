import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { getIssueDetail } from '../../src/commands/detail';

function makeMockIssue(overrides = {}) {
  return {
    identifier: 'KIN-1',
    title: 'Fix auth bug',
    url: 'https://linear.app/kindred/issue/KIN-1',
    description: 'JWT token expires too quickly in the middleware.',
    updatedAt: new Date('2026-05-20'),
    createdAt: new Date('2026-05-10'),
    state: Promise.resolve({ name: 'In Progress' }),
    assignee: Promise.resolve({ displayName: 'Adam Horner' }),
    team: Promise.resolve({ name: 'Kindred' }),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('getIssueDetail', () => {
  it('includes identifier and title in heading', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue()),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('# KIN-1');
    expect(md).toContain('Fix auth bug');
  });

  it('includes status, assignee, and team', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue()),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('In Progress');
    expect(md).toContain('Adam Horner');
    expect(md).toContain('Kindred');
  });

  it('includes description body', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue()),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('JWT token expires');
  });

  it('shows placeholder when description is absent', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue({ description: null })),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('No description');
  });
});
