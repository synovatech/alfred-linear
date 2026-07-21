import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { fetchTeams, fetchProjects } from '../../src/commands/lookups';

beforeEach(() => { vi.clearAllMocks(); });

function clientWith(overrides: Record<string, unknown>) {
  vi.mocked(getClient).mockResolvedValue(overrides as any);
}

describe('fetchTeams', () => {
  const teams = { nodes: [
    { key: 'ENG', name: 'Engineering' },
    { key: 'DES', name: 'Design' },
    { key: 'MKT', name: 'Marketing' },
  ] };

  it('returns all teams for an empty partial', async () => {
    clientWith({ teams: vi.fn().mockResolvedValue(teams) });
    const result = await fetchTeams('');
    expect(result).toEqual([
      { key: 'ENG', name: 'Engineering' },
      { key: 'DES', name: 'Design' },
      { key: 'MKT', name: 'Marketing' },
    ]);
  });

  it('matches by key prefix, case-insensitively', async () => {
    clientWith({ teams: vi.fn().mockResolvedValue(teams) });
    expect(await fetchTeams('en')).toEqual([{ key: 'ENG', name: 'Engineering' }]);
  });

  it('also matches by name substring', async () => {
    clientWith({ teams: vi.fn().mockResolvedValue(teams) });
    expect((await fetchTeams('design')).map((t) => t.key)).toEqual(['DES']);
  });
});

describe('fetchProjects', () => {
  const projects = { nodes: [
    { name: 'Mobile App Q3' },
    { name: 'Web Redesign' },
  ] };

  it('scopes the query to a team when a teamKey is given', async () => {
    const projectsSpy = vi.fn().mockResolvedValue(projects);
    clientWith({ projects: projectsSpy });
    await fetchProjects('', 'ENG');
    expect(projectsSpy).toHaveBeenCalledWith({
      first: 50,
      filter: { accessibleTeams: { some: { key: { eq: 'ENG' } } } },
    });
  });

  it('omits the team filter when no teamKey is given', async () => {
    const projectsSpy = vi.fn().mockResolvedValue(projects);
    clientWith({ projects: projectsSpy });
    await fetchProjects('');
    expect(projectsSpy).toHaveBeenCalledWith({ first: 50 });
  });

  it('filters results by name substring, case-insensitively', async () => {
    clientWith({ projects: vi.fn().mockResolvedValue(projects) });
    expect(await fetchProjects('mob')).toEqual([{ name: 'Mobile App Q3' }]);
  });
});
