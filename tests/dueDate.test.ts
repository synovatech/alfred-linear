import { describe, it, expect } from 'vitest';
import { parseDue, DUE_KEYWORDS } from '../src/dueDate';

// Wednesday 15 July 2026 — week (Mon-start) is 13th–19th July.
const NOW = new Date(2026, 6, 15);

describe('parseDue — explicit dates', () => {
  it('parses yyyy-mm-dd as an exact due date', () => {
    expect(parseDue('2026-07-01')).toEqual({ eq: '2026-07-01' });
  });

  it('parses dd-mm-yyyy (day first)', () => {
    expect(parseDue('01-07-2026')).toEqual({ eq: '2026-07-01' });
  });

  it('parses dd-mm-yy as 20yy, day first', () => {
    expect(parseDue('01-07-26')).toEqual({ eq: '2026-07-01' });
  });

  it('parses compact yyyymmdd', () => {
    expect(parseDue('20260701')).toEqual({ eq: '2026-07-01' });
  });

  it('accepts / as a separator', () => {
    expect(parseDue('01/07/2026')).toEqual({ eq: '2026-07-01' });
  });

  it('maps < and > to exclusive lt / gt', () => {
    expect(parseDue('<2026-07-01')).toEqual({ lt: '2026-07-01' });
    expect(parseDue('>2026-07-01')).toEqual({ gt: '2026-07-01' });
    expect(parseDue('<01-07-2026')).toEqual({ lt: '2026-07-01' });
  });

  it('rejects impossible and unparseable dates', () => {
    expect(parseDue('2026-02-30')).toBeNull();
    expect(parseDue('2026-13-01')).toBeNull();
    expect(parseDue('nonsense')).toBeNull();
    expect(parseDue('')).toBeNull();
  });
});

describe('parseDue — keywords', () => {
  it('handles single-day keywords', () => {
    expect(parseDue('today', NOW)).toEqual({ eq: '2026-07-15' });
    expect(parseDue('yesterday', NOW)).toEqual({ eq: '2026-07-14' });
    expect(parseDue('tomorrow', NOW)).toEqual({ eq: '2026-07-16' });
  });

  it('is case-insensitive', () => {
    expect(parseDue('TODAY', NOW)).toEqual({ eq: '2026-07-15' });
  });

  it('handles week ranges (Monday start)', () => {
    expect(parseDue('this-week', NOW)).toEqual({ gte: '2026-07-13', lte: '2026-07-19' });
    expect(parseDue('last-week', NOW)).toEqual({ gte: '2026-07-06', lte: '2026-07-12' });
    expect(parseDue('next-week', NOW)).toEqual({ gte: '2026-07-20', lte: '2026-07-26' });
  });

  it('handles month ranges', () => {
    expect(parseDue('this-month', NOW)).toEqual({ gte: '2026-07-01', lte: '2026-07-31' });
    expect(parseDue('last-month', NOW)).toEqual({ gte: '2026-06-01', lte: '2026-06-30' });
    expect(parseDue('next-month', NOW)).toEqual({ gte: '2026-08-01', lte: '2026-08-31' });
  });

  it('handles overdue and soon', () => {
    expect(parseDue('overdue', NOW)).toEqual({ lt: '2026-07-15' });
    expect(parseDue('soon', NOW)).toEqual({ gte: '2026-07-15', lte: '2026-07-22' });
  });

  it('handles presence keywords via null', () => {
    expect(parseDue('no-due', NOW)).toEqual({ null: true });
    expect(parseDue('has-due', NOW)).toEqual({ null: false });
  });
});

describe('DUE_KEYWORDS', () => {
  it('uses the token "soon" (not "due-soon")', () => {
    const tokens = DUE_KEYWORDS.map((k) => k.token);
    expect(tokens).toContain('soon');
    expect(tokens).not.toContain('due-soon');
  });

  it('every keyword parses to a filter', () => {
    for (const k of DUE_KEYWORDS) expect(parseDue(k.token, NOW)).not.toBeNull();
  });
});
