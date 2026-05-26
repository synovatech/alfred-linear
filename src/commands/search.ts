import { getClient } from '../linear';
import { makeSearchItem, type AlfredItem, type IssueShape } from '../alfred';

export async function searchIssues(query: string): Promise<AlfredItem[]> {
  const client = await getClient();
  const result = await client.searchIssues(query, { first: 10 });

  if (result.nodes.length === 0) {
    return [{ title: `No results for "${query}"`, subtitle: 'Try a different search term', valid: false }];
  }

  const isSingle = result.nodes.length === 1;

  return Promise.all(
    result.nodes.map(async (issue) => {
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
