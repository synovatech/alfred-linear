import { describe, it, expect } from 'vitest';
import { SMART_OPTIONS, ACTIVE_STATE_FILTER, matchSmartOptions } from '../src/smartOptions';

describe('SMART_OPTIONS registry', () => {
  it('includes the "all" option with a subtitle', () => {
    const all = SMART_OPTIONS.find((o) => o.token === 'all');
    expect(all).toBeDefined();
    expect(all!.subtitle.length).toBeGreaterThan(0);
  });
});

describe('ACTIVE_STATE_FILTER', () => {
  it('filters to the four active meta-state types, excluding completed/canceled/duplicate', () => {
    expect(ACTIVE_STATE_FILTER).toEqual({
      state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } },
    });
  });
});

describe('matchSmartOptions', () => {
  it('returns every option for an empty partial', () => {
    expect(matchSmartOptions('')).toEqual(SMART_OPTIONS);
  });

  it('returns options whose token starts with the partial', () => {
    expect(matchSmartOptions('a').map((o) => o.token)).toEqual(['all']);
  });

  it('is case-insensitive', () => {
    expect(matchSmartOptions('AL').map((o) => o.token)).toEqual(['all']);
  });

  it('returns nothing when no token matches', () => {
    expect(matchSmartOptions('zzz')).toEqual([]);
  });
});
