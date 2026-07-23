// Registry of ":"-prefixed smart search options. Adding an option is one entry
// here (plus, for a new async arg source, a fetcher in commands/lookups.ts).
// Both the Alfred autocomplete picker and the search dispatch read from this
// list. Token abbreviations resolve by unique prefix (see resolveOption).
import { parseDue, type DueFilter } from './dueDate';

// A permissive structural view of the bits of Linear's IssueFilter we build.
export interface IssueFilterInput {
  assignee?: { isMe: { eq: boolean } };
  team?: { key: { eq: string } };
  project?: { name: { eq: string } };
  priority?: { eq: number };
  state?: { type: { in?: string[]; eq?: string } };
  dueDate?: DueFilter;
}

export interface PriorityChoice {
  label: string;
  value: number;
}

// Linear's fixed scale: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low.
export const PRIORITY_CHOICES: PriorityChoice[] = [
  { label: 'Urgent', value: 1 },
  { label: 'High', value: 2 },
  { label: 'Medium', value: 3 },
  { label: 'Low', value: 4 },
  { label: 'None', value: 0 },
];

export interface FlagOption {
  kind: 'flag';
  token: string;
  subtitle: string;
  // Occupies the "state" dimension, so the active-only default is not applied.
  setsState?: boolean;
  apply(filter: IssueFilterInput): void;
}

export interface ArgOption {
  kind: 'arg';
  token: string;
  subtitle: string;
  argHint: string;
  // Names the argument-suggestion source: 'teams'/'projects' are fetched live;
  // 'priority'/'due' are static keyword lists.
  source: 'teams' | 'projects' | 'priority' | 'due';
  apply(filter: IssueFilterInput, value: string): void;
  // Optional validation of a completed free-form arg (e.g. :due dates).
  validate?(value: string): boolean;
}

export type SmartOption = FlagOption | ArgOption;

// Default search filter: only "active" meta-states. WorkflowState.type is a
// fixed enum — triage, backlog, unstarted, started, completed, canceled,
// duplicate — so a positive `in` list is unambiguous and correctly drops the
// closed-ish `duplicate` type that a negative filter would let through.
export const ACTIVE_STATE_TYPES = ['triage', 'backlog', 'unstarted', 'started'];
export const ACTIVE_STATE_FILTER: IssueFilterInput = {
  state: { type: { in: ACTIVE_STATE_TYPES } },
};

export const SMART_OPTIONS: SmartOption[] = [
  {
    kind: 'flag',
    token: 'all',
    subtitle: 'Search all tickets — including Done & Canceled, not just active',
    setsState: true,
    apply(f) {
      // No state constraint. Clears any state set by an earlier option so that
      // among conflicting state options the last one in the chain wins.
      delete f.state;
    },
  },
  {
    kind: 'flag',
    token: 'mine',
    subtitle: 'Search for tickets assigned to me only',
    apply(f) {
      f.assignee = { isMe: { eq: true } };
    },
  },
  {
    kind: 'flag',
    token: 'done',
    subtitle: 'Search for completed tickets only',
    setsState: true,
    apply(f) {
      f.state = { type: { eq: 'completed' } };
    },
  },
  {
    kind: 'arg',
    token: 'team',
    subtitle: 'Search tickets by Team',
    argHint: 'KEY',
    source: 'teams',
    apply(f, v) {
      f.team = { key: { eq: v } };
    },
  },
  {
    kind: 'arg',
    token: 'project',
    subtitle: 'Search tickets by Project',
    argHint: 'NAME',
    source: 'projects',
    apply(f, v) {
      f.project = { name: { eq: v } };
    },
  },
  {
    kind: 'arg',
    token: 'priority',
    subtitle: 'Search tickets by Priority',
    argHint: 'LEVEL',
    source: 'priority',
    apply(f, v) {
      const choice = PRIORITY_CHOICES.find((p) => p.label.toLowerCase() === v.toLowerCase());
      if (choice) f.priority = { eq: choice.value };
    },
  },
  {
    kind: 'arg',
    token: 'due',
    subtitle: 'Search tickets by due date',
    argHint: 'DATE|KEYWORD',
    source: 'due',
    apply(f, v) {
      const fragment = parseDue(v);
      if (fragment) f.dueDate = fragment;
    },
    validate: (v) => parseDue(v) !== null,
  },
];

export function optionsByPrefix(partial: string): SmartOption[] {
  const p = partial.toLowerCase();
  return SMART_OPTIONS.filter((o) => o.token.startsWith(p));
}

// Resolve a typed token to an option: exact match wins, otherwise a unique
// prefix (`:proj` → project). Ambiguous (`:p` → project|priority) or unknown
// tokens return null.
export function resolveOption(token: string): SmartOption | null {
  const t = token.toLowerCase();
  const exact = SMART_OPTIONS.find((o) => o.token === t);
  if (exact) return exact;
  const matches = optionsByPrefix(t);
  return matches.length === 1 ? matches[0] : null;
}
