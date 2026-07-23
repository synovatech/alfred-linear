import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from 'date-fns';

// Filter fragment for Linear's dueDate (a NullableTimelessDateComparator).
export interface DueFilter {
  eq?: string;
  lt?: string;
  gt?: string;
  gte?: string;
  lte?: string;
  null?: boolean;
}

export interface DueKeyword {
  token: string;
  label: string;
  description: string;
}

const ISO = 'yyyy-MM-dd';
const fmt = (d: Date) => format(d, ISO);
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

// Explicit formats parsed by hand so our rules are exact: day-first for
// dd-mm-*, 2-digit years are 20yy, and impossible dates are rejected via a
// round-trip check. Accepts "-" or "/" separators.
function parseExplicit(input: string): string | null {
  const s = input.replace(/\//g, '-');
  let y: number;
  let m: number;
  let d: number;
  let g: RegExpMatchArray | null;
  if ((g = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [+g[1], +g[2], +g[3]];
  else if ((g = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = [+g[1], +g[2], +g[3]];
  else if ((g = s.match(/^(\d{2})-(\d{2})-(\d{4})$/))) [d, m, y] = [+g[1], +g[2], +g[3]];
  else if ((g = s.match(/^(\d{2})-(\d{2})-(\d{2})$/))) [d, m, y] = [+g[1], +g[2], 2000 + +g[3]];
  else return null;

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

const week = (d: Date): DueFilter => ({
  gte: fmt(startOfWeek(d, { weekStartsOn: 1 })),
  lte: fmt(endOfWeek(d, { weekStartsOn: 1 })),
});
const month = (d: Date): DueFilter => ({ gte: fmt(startOfMonth(d)), lte: fmt(endOfMonth(d)) });
const day = (d: Date): DueFilter => ({ eq: fmt(d) });

const KEYWORDS: Record<string, (now: Date) => DueFilter> = {
  today: (n) => day(n),
  yesterday: (n) => day(addDays(n, -1)),
  tomorrow: (n) => day(addDays(n, 1)),
  'this-week': (n) => week(n),
  'last-week': (n) => week(subWeeks(n, 1)),
  'next-week': (n) => week(addWeeks(n, 1)),
  'this-month': (n) => month(n),
  'last-month': (n) => month(subMonths(n, 1)),
  'next-month': (n) => month(addMonths(n, 1)),
  overdue: (n) => ({ lt: fmt(n) }),
  soon: (n) => ({ gte: fmt(n), lte: fmt(addDays(n, 7)) }),
  'no-due': () => ({ null: true }),
  'has-due': () => ({ null: false }),
};

export const DUE_KEYWORDS: DueKeyword[] = [
  { token: 'today', label: 'Today', description: 'Due today' },
  { token: 'yesterday', label: 'Yesterday', description: 'Due yesterday' },
  { token: 'tomorrow', label: 'Tomorrow', description: 'Due tomorrow' },
  { token: 'this-week', label: 'This week', description: 'Due this week (Mon–Sun)' },
  { token: 'last-week', label: 'Last week', description: 'Due last week' },
  { token: 'next-week', label: 'Next week', description: 'Due next week' },
  { token: 'this-month', label: 'This month', description: 'Due this month' },
  { token: 'last-month', label: 'Last month', description: 'Due last month' },
  { token: 'next-month', label: 'Next month', description: 'Due next month' },
  { token: 'overdue', label: 'Overdue', description: 'Due before today' },
  { token: 'soon', label: 'Soon', description: 'Due within the next 7 days' },
  { token: 'no-due', label: 'No due date', description: 'No due date set' },
  { token: 'has-due', label: 'Has due date', description: 'Any due date set' },
];

// Parse a :due argument into a dueDate filter fragment, or null if invalid.
// `now` is injectable so relative keywords are deterministic in tests.
export function parseDue(raw: string, now: Date = new Date()): DueFilter | null {
  const v = raw.trim();
  if (!v) return null;

  if (v[0] === '<' || v[0] === '>') {
    const d = parseExplicit(v.slice(1));
    if (!d) return null;
    return v[0] === '<' ? { lt: d } : { gt: d };
  }

  const keyword = KEYWORDS[v.toLowerCase()];
  if (keyword) return keyword(now);

  const d = parseExplicit(v);
  return d ? { eq: d } : null;
}
