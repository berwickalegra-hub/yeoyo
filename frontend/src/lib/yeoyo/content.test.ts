import { describe, it, expect } from 'vitest';
import { periodicPick } from './content';

describe('periodicPick', () => {
  it('Test 1: is stable across multiple calls within the same period', () => {
    const list = ['a', 'b', 'c', 'd', 'e'] as const;
    const base = new Date('2026-08-17T00:00:00.000Z');
    const laterSamePeriod = new Date('2026-08-17T05:00:00.000Z');

    expect(periodicPick(list, 12, base)).toBe(periodicPick(list, 12, laterSamePeriod));
  });

  it('Test 2: changes once the period boundary is crossed', () => {
    const list = ['a', 'b', 'c', 'd', 'e'] as const;
    const before = new Date('2026-08-17T11:59:00.000Z');
    const after = new Date('2026-08-17T12:01:00.000Z');

    expect(periodicPick(list, 12, before)).not.toBe(periodicPick(list, 12, after));
  });

  it('Test 3: is deterministic, not random — same date always yields the same pick', () => {
    const list = ['a', 'b', 'c'] as const;
    const date = new Date('2026-08-17T09:00:00.000Z');

    expect(periodicPick(list, 12, date)).toBe(periodicPick(list, 12, date));
  });

  it('Test 4: throws on an empty list instead of silently returning undefined', () => {
    expect(() => periodicPick([], 12)).toThrow();
  });
});
