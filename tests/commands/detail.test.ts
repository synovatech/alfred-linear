import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { getIssueDetail } from '../../src/commands/detail';

function makeMockIssue(overrides: Record<string, unknown> = {}) {
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
    attachments: vi.fn().mockResolvedValue({ nodes: [] }),
    children: vi.fn().mockResolvedValue({ nodes: [] }),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('getIssueDetail', () => {
  it('includes identifier and title in heading', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue()] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('# KIN-1');
    expect(md).toContain('Fix auth bug');
  });

  it('includes status, assignee, and team', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue()] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('In Progress');
    expect(md).toContain('Adam Horner');
    expect(md).toContain('Kindred');
  });

  it('includes description body', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue()] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('JWT token expires');
  });

  it('shows placeholder when description is absent', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue({ description: null })] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('No description');
  });

  it('lists sub-issues when present', async () => {
    const issue = makeMockIssue({
      children: vi.fn().mockResolvedValue({
        nodes: [
          { identifier: 'KIN-2', title: 'Sub task one' },
          { identifier: 'KIN-3', title: 'Sub task two' },
        ],
      }),
    });
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [issue] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('Sub-issues');
    expect(md).toContain('KIN-2: Sub task one');
    expect(md).toContain('KIN-3: Sub task two');
  });

  it('omits sub-issues section when empty', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue()] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).not.toContain('Sub-issues');
  });

  it('lists attachments when present', async () => {
    const issue = makeMockIssue({
      attachments: vi.fn().mockResolvedValue({
        nodes: [{ title: 'Design doc', url: 'https://example.com/doc' }],
      }),
    });
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [issue] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('Attachments');
    expect(md).toContain('[Design doc](https://example.com/doc)');
  });

  it('omits attachments section when empty', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue()] }),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).not.toContain('Attachments');
  });
});
