import { getClient } from '../linear';

export interface TeamOption {
  key: string;
  name: string;
}

export interface ProjectOption {
  name: string;
}

const MAX_SUGGESTIONS = 9;

export async function fetchTeams(partial: string): Promise<TeamOption[]> {
  const client = await getClient();
  const { nodes } = await client.teams({ first: 50 });
  const p = partial.toLowerCase();
  return nodes
    .filter((t) => t.key.toLowerCase().startsWith(p) || t.name.toLowerCase().includes(p))
    .slice(0, MAX_SUGGESTIONS)
    .map((t) => ({ key: t.key, name: t.name }));
}

export async function fetchProjects(partial: string, teamKey?: string): Promise<ProjectOption[]> {
  const client = await getClient();
  const { nodes } = await client.projects({
    first: 50,
    ...(teamKey ? { filter: { accessibleTeams: { some: { key: { eq: teamKey } } } } } : {}),
  });
  const p = partial.toLowerCase();
  return nodes
    .filter((proj) => proj.name.toLowerCase().includes(p))
    .slice(0, MAX_SUGGESTIONS)
    .map((proj) => ({ name: proj.name }));
}
