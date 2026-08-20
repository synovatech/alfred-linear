import { PaginationOrderBy } from '@linear/sdk';
import { getClient } from '../linear';
import { makeSearchItem, type AlfredItem, type IssueShape } from '../alfred';
import type { IssueFilterInput } from '../smartOptions';
import type { IdentifierQuery } from '../query';

// Shape the SDK issue nodes shared by full-text search, identifier lookup and
// filter browsing. Callers handle the empty case themselves.
async function toItems(nodes: any[]): Promise<AlfredItem[]> {
  const isSingle = nodes.length === 1;
  return Promise.all(
    nodes.map(async (issue) => {
      const [state, assignee] = await Promise.all([issue.state, issue.assignee]);
      const shape: IssueShape = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        description: issue.description,
        updatedAt: issue.updatedAt.toISOString(),
        state: state ? { name: state.name } : null,
        assignee: assignee ? { displayName: assignee.displayName } : null,
      };
      return makeSearchItem(shape, isSingle);
    }),
  );
}

export async function searchIssues(query: string, filter?: IssueFilterInput): Promise<AlfredItem[]> {
  const client = await getClient();
  const result = await client.searchIssues(query, { first: 10, filter } as any);
  if (result.nodes.length === 0) {
    return [{ title: `No results for "${query}"`, subtitle: 'Try a different search term', valid: false }];
  }
  return toItems(result.nodes);
}

// An exact ticket code (KIN-206) resolves by number + team rather than by
// full-text search, so the active-only default never hides a closed ticket.
// Explicitly-requested filters still apply. If nothing matches — a typo'd or
// non-existent code — fall through to an ordinary search on the same term.
export async function findByIdentifier(q: Omit<IdentifierQuery, 'mode'>): Promise<AlfredItem[]> {
  const client = await getClient();
  const result = await client.issues({
    first: 1,
    filter: { ...q.lookupFilter, number: { eq: q.number }, team: { key: { eq: q.team } } },
  } as any);
  if (result.nodes.length > 0) return toItems(result.nodes);
  return searchIssues(q.term, q.filter);
}

export async function listIssues(filter: IssueFilterInput): Promise<AlfredItem[]> {
  const client = await getClient();
  const result = await client.issues({ first: 10, filter, orderBy: PaginationOrderBy.UpdatedAt } as any);
  if (result.nodes.length === 0) {
    return [{ title: 'No matching issues', subtitle: 'Adjust your filters', valid: false }];
  }
  return toItems(result.nodes);
}
