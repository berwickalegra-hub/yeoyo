import { describe, it, expect } from 'vitest';
import { roleRank } from './require-admin';

describe('roleRank', () => {
  it('orders USER < MODERATOR < ADMIN < SUPERADMIN', () => {
    expect(roleRank('USER')).toBeLessThan(roleRank('MODERATOR'));
    expect(roleRank('MODERATOR')).toBeLessThan(roleRank('ADMIN'));
    expect(roleRank('ADMIN')).toBeLessThan(roleRank('SUPERADMIN'));
  });

  it('MODERATOR passes a MODERATOR-minimum gate but not an ADMIN-minimum gate', () => {
    expect(roleRank('MODERATOR') >= roleRank('MODERATOR')).toBe(true);
    expect(roleRank('MODERATOR') >= roleRank('ADMIN')).toBe(false);
  });
});
