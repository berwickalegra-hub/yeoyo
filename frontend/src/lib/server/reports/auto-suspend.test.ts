import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { maybeAutoSuspend, AUTO_SUSPEND_REPORT_THRESHOLD } from './auto-suspend';

beforeEach(() => {
  prismaMock.report.count.mockResolvedValue(0 as never);
  prismaMock.user.updateMany.mockResolvedValue({ count: 0 } as never);
});

describe('maybeAutoSuspend', () => {
  it('Test 1: threshold constant is 3, per the product spec', () => {
    expect(AUTO_SUSPEND_REPORT_THRESHOLD).toBe(3);
  });

  it('Test 2: under the threshold → not suspended, updateMany never called', async () => {
    prismaMock.report.count.mockResolvedValue(2 as never);

    const result = await maybeAutoSuspend(prismaMock, 'user-1');

    expect(result).toEqual({ suspended: false, reportCount: 2 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('Test 3: at the threshold, not yet suspended → suspends and reports it', async () => {
    prismaMock.report.count.mockResolvedValue(3 as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await maybeAutoSuspend(prismaMock, 'user-1');

    expect(result).toEqual({ suspended: true, reportCount: 3 });
    const args = prismaMock.user.updateMany.mock.calls[0]?.[0];
    expect(args?.where?.id).toBe('user-1');
    expect(args?.where?.status).toEqual({ not: 'SUSPENDED' });
    expect(args?.data?.status).toBe('SUSPENDED');
  });

  it('Test 4: over the threshold but already SUSPENDED → updateMany matches nothing, suspended:false', async () => {
    prismaMock.report.count.mockResolvedValue(5 as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await maybeAutoSuspend(prismaMock, 'user-1');

    expect(result).toEqual({ suspended: false, reportCount: 5 });
  });
});
