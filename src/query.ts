import {
  type SmartOption,
  type ArgOption,
  type IssueFilterInput,
  ACTIVE_STATE_TYPES,
  resolveOption,
  optionsByPrefix,
} from './smartOptions';

export interface Token {
  value: string;
  quoted: boolean;
  openQuote: boolean;
  start: number;
}

// Whitespace-split, but a double-quoted span is a single token (quotes stripped)
// so multi-word values like project names survive. Reports whether the raw
// string ends in a space — the "this token is finished" signal.
export function tokenize(raw: string): { tokens: Token[]; trailingSpace: boolean } {
  const tokens: Token[] = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    while (i < n && raw[i] === ' ') i++;
    if (i >= n) break;
    const start = i;
    if (raw[i] === '"') {
      i++;
      let value = '';
      let openQuote = true;
      while (i < n) {
        if (raw[i] === '"') {
          openQuote = false;
          i++;
          break;
        }
        value += raw[i++];
      }
      tokens.push({ value, quoted: true, openQuote, start });
    } else {
      let value = '';
      while (i < n && raw[i] !== ' ') value += raw[i++];
      tokens.push({ value, quoted: false, openQuote: false, start });
    }
  }
  return { tokens, trailingSpace: n > 0 && raw[n - 1] === ' ' };
}

export interface Modifier {
  option: SmartOption;
  value?: string;
}

// Merge each modifier's filter fragment. If no option touched the state
// dimension, apply the active-only default — unless `applyDefault` is false,
// which yields the explicitly-requested filters alone (used by exact
// identifier lookups, where the implicit default would hide a closed ticket).
export function assembleFilter(mods: Modifier[], applyDefault = true): IssueFilterInput {
  const filter: IssueFilterInput = {};
  let stateSet = false;
  for (const { option, value } of mods) {
    if (option.kind === 'flag') {
      option.apply(filter);
      if (option.setsState) stateSet = true;
    } else {
      option.apply(filter, value ?? '');
    }
  }
  if (!stateSet && applyDefault) filter.state = { type: { in: [...ACTIVE_STATE_TYPES] } };
  return filter;
}

function renderModifier(option: SmartOption, value?: string): string {
  if (option.kind === 'flag') return `:${option.token} `;
  if (option.token === 'project') return `:project "${value}" `;
  return `:${option.token} ${value} `;
}

// A term that is exactly a ticket code, e.g. `KIN-206`. `lookupFilter` holds
// only the explicitly-requested filters (no active-only default) for the direct
// number+team lookup; `filter` is the ordinary search filter used if that misses.
export interface IdentifierQuery {
  mode: 'identifier';
  team: string;
  number: number;
  term: string;
  lookupFilter: IssueFilterInput;
  filter: IssueFilterInput;
}

// Terms of the form TEAM-123 are looked up exactly rather than full-text
// searched, so a completed ticket is still found by its code.
const IDENTIFIER_TERM = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

export type ParsedQuery =
  | { mode: 'empty' }
  | IdentifierQuery
  | { mode: 'create'; team: string; title: string }
  | { mode: 'suggest'; source: 'options' | 'teams' | 'projects' | 'priority' | 'due'; partial: string; prefix: string; teamKey?: string }
  | { mode: 'error'; message: string }
  | { mode: 'search'; term: string; filter: IssueFilterInput }
  | { mode: 'list'; filter: IssueFilterInput };

function suggestArgs(option: ArgOption, partial: string, prefix: string, teamKey?: string): ParsedQuery {
  return {
    mode: 'suggest',
    source: option.source,
    partial,
    prefix,
    ...(option.source === 'projects' ? { teamKey } : {}),
  };
}

export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (trimmed === '') return { mode: 'empty' };

  const createMatch = trimmed.match(/^\+([A-Z]{2,5})\s+(.+)$/);
  if (createMatch) return { mode: 'create', team: createMatch[1], title: createMatch[2] };

  const { tokens, trailingSpace } = tokenize(raw);
  const mods: Modifier[] = [];
  let teamKey: string | undefined;
  const prefix = () => mods.map((m) => renderModifier(m.option, m.value)).join('');

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.quoted || !tok.value.startsWith(':')) break; // free text starts here

    const name = tok.value.slice(1);
    const isLast = i === tokens.length - 1;
    const tokenComplete = !isLast || trailingSpace;

    // Still typing the option name → offer the picker.
    if (!tokenComplete) return { mode: 'suggest', source: 'options', partial: name, prefix: prefix() };

    const opt = resolveOption(name);
    if (!opt) {
      // Ambiguous (matches >1) → keep offering the picker; unknown → literal search.
      if (optionsByPrefix(name).length > 0) {
        return { mode: 'suggest', source: 'options', partial: name, prefix: prefix() };
      }
      break;
    }

    if (opt.kind === 'flag') {
      mods.push({ option: opt });
      i += 1;
      continue;
    }

    // Arg option: its value is the following token.
    const argTok = tokens[i + 1];
    if (!argTok) return suggestArgs(opt, '', prefix(), teamKey);

    const argComplete = i + 1 !== tokens.length - 1 || trailingSpace;
    if (!argComplete) return suggestArgs(opt, argTok.value, prefix(), teamKey);

    if (opt.validate && !opt.validate(argTok.value)) {
      return { mode: 'error', message: `Unrecognized date: ${argTok.value}` };
    }
    mods.push({ option: opt, value: argTok.value });
    if (opt.token === 'team') teamKey = argTok.value;
    i += 2;
  }

  const term = i < tokens.length ? raw.slice(tokens[i].start).trim() : '';
  const filter = assembleFilter(mods);

  if (term) {
    const id = term.match(IDENTIFIER_TERM);
    const explicitTeam = filter.team?.key.eq;
    // A contradictory `:team ENG KIN-206` cannot resolve as a lookup — let the
    // ordinary filtered search answer it (with nothing) instead.
    if (id && (!explicitTeam || explicitTeam.toUpperCase() === id[1].toUpperCase())) {
      return {
        mode: 'identifier',
        team: id[1].toUpperCase(),
        number: parseInt(id[2], 10),
        term,
        lookupFilter: assembleFilter(mods, false),
        filter,
      };
    }
    return { mode: 'search', term, filter };
  }
  if (mods.length > 0) return { mode: 'list', filter };
  return { mode: 'empty' };
}
