import { describe, it, expect } from 'vitest';
import { seedModerator, seedAdminInvite } from '@/test-utils/admin-fixtures';

describe('admin auth foundation schema fixtures', () => {
  it('seedModerator returns role MODERATOR with 2FA fields defaulted', () => {
    const user = seedModerator();
    expect(user.role).toBe('MODERATOR');
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecret).toBeNull();
  });

  it('seedAdminInvite returns a pending, unexpired invite', () => {
    const invite = seedAdminInvite();
    expect(invite.acceptedAt).toBeNull();
    expect(invite.revokedAt).toBeNull();
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now() - 1000 * 60 * 60 * 24 * 365);
  });
});
