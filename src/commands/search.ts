import { PaginationOrderBy } from '@linear/sdk';
import { getClient } from '../linear';
import { makeSearchItem, type AlfredItem, type IssueShape } from '../alfred';
import type { IssueFilterInput } from '../smartOptions';

// Shape the SDK issue nodes shared by full-text search and filter browsing.
async function toItems(nodes: any[], emptyMessage: AlfredItem): Promise<AlfredItem[]> {
  if (nodes.length === 0) return [emptyMessage];
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
  return toItems(result.nodes, {
    title: `No results for "${query}"`,
    subtitle: 'Try a different search term',
    valid: false,
  });
}

export async function listIssues(filter: IssueFilterInput): Promise<AlfredItem[]> {
  const client = await getClient();
  const result = await client.issues({ first: 10, filter, orderBy: PaginationOrderBy.UpdatedAt } as any);
  return toItems(result.nodes, {
    title: 'No matching issues',
    subtitle: 'Adjust your filters',
    valid: false,
  });
}
