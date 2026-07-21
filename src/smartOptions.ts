// Registry of ":"-prefixed smart search options. Adding a new option is one
// entry here (plus its filter behaviour in parseQuery/searchIssues). Both the
// Alfred autocomplete picker and the search dispatch read from this list.

export interface SmartOption {
  token: string;
  subtitle: string;
}

export const SMART_OPTIONS: SmartOption[] = [
  { token: 'all', subtitle: 'Search all tickets — including Done & Canceled, not just active' },
];

// Default search filter: only "active" meta-states. WorkflowState.type is a
// fixed enum — triage, backlog, unstarted, started, completed, canceled,
// duplicate — so a positive `in` list is unambiguous and correctly drops the
// closed-ish `duplicate` type that a negative filter would let through.
export const ACTIVE_STATE_FILTER = {
  state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } },
};

export function matchSmartOptions(partial: string): SmartOption[] {
  const p = partial.toLowerCase();
  return SMART_OPTIONS.filter((o) => o.token.startsWith(p));
}
