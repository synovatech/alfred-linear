import { describe, it, expect } from 'vitest';
import {
  SMART_OPTIONS,
  ACTIVE_STATE_FILTER,
  PRIORITY_CHOICES,
  optionsByPrefix,
  resolveOption,
} from '../src/smartOptions';

describe('SMART_OPTIONS registry', () => {
  it('has all six options with subtitles', () => {
    expect(SMART_OPTIONS.map((o) => o.token).sort()).toEqual(
      ['all', 'done', 'mine', 'priority', 'project', 'team'],
    );
    for (const o of SMART_OPTIONS) expect(o.subtitle.length).toBeGreaterThan(0);
  });

  it('marks all/done as state-dimension flags', () => {
    const setsState = SMART_OPTIONS.filter((o) => o.kind === 'flag' && o.setsState).map((o) => o.token);
    expect(setsState.sort()).toEqual(['all', 'done']);
  });
});

describe('ACTIVE_STATE_FILTER', () => {
  it('filters to the four active meta-state types', () => {
    expect(ACTIVE_STATE_FILTER).toEqual({
      state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } },
    });
  });
});

describe('PRIORITY_CHOICES', () => {
  it('maps labels to Linear priority numbers', () => {
    expect(PRIORITY_CHOICES).toEqual([
      { label: 'Urgent', value: 1 },
      { label: 'High', value: 2 },
      { label: 'Medium', value: 3 },
      { label: 'Low', value: 4 },
      { label: 'None', value: 0 },
    ]);
  });
});

describe('optionsByPrefix', () => {
  it('returns all options for an empty partial', () => {
    expect(optionsByPrefix('').length).toBe(SMART_OPTIONS.length);
  });

  it('is case-insensitive and prefix-based', () => {
    expect(optionsByPrefix('PRO').map((o) => o.token)).toEqual(['project']);
  });

  it('returns both p-options for the shared prefix', () => {
    expect(optionsByPrefix('p').map((o) => o.token).sort()).toEqual(['priority', 'project']);
  });
});

describe('resolveOption', () => {
  it('resolves an exact token', () => {
    expect(resolveOption('team')?.token).toBe('team');
  });

  it('resolves a unique prefix', () => {
    expect(resolveOption('proj')?.token).toBe('project');
    expect(resolveOption('pri')?.token).toBe('priority');
    expect(resolveOption('m')?.token).toBe('mine');
  });

  it('returns null for an ambiguous prefix', () => {
    expect(resolveOption('p')).toBeNull();
    expect(resolveOption('pr')).toBeNull();
  });

  it('returns null for an unknown token', () => {
    expect(resolveOption('zzz')).toBeNull();
  });
});
