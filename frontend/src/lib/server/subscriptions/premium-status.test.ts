import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getPremiumUserIds } from './premium-status';

beforeEach(() => {
  prismaMock.subscription.findMany.mockResolvedValue([] as never);
});

describe('getPremiumUserIds', () => {
  it('Test 1: returns an empty set without querying Prisma when given no userIds', async () => {
    const result = await getPremiumUserIds(prismaMock, []);

    expect(result.size).toBe(0);
    expect(prismaMock.subscription.findMany).not.toHaveBeenCalled();
  });

  it('Test 2: batches a single findMany call scoped to ACTIVE status for the given userIds', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([{ userId: 'user-a' }] as never);

    await getPremiumUserIds(prismaMock, ['user-a', 'user-b']);

    expect(prismaMock.subscription.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('ACTIVE');
    expect(args?.where?.userId).toEqual({ in: ['user-a', 'user-b'] });
  });

  it('Test 3: returns a Set containing only the userIds with an active subscription', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([{ userId: 'user-a' }] as never);

    const result = await getPremiumUserIds(prismaMock, ['user-a', 'user-b']);

    expect(result.has('user-a')).toBe(true);
    expect(result.has('user-b')).toBe(false);
  });
});
