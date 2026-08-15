// ADMIN-07 / D-SCRIPT-01 — make-superadmin CLI script.
//
// Tests invoke `main(args, { prisma })` directly with a mocked Prisma client
// (no subprocess spawn, no real DB). The CLI entrypoint guard
// (`if (import.meta.url === ...)`) keeps the script's auto-run path inert
// when imported by vitest.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './make-superadmin';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  // Default: $transaction runs the callback against the same mock — sufficient
  // for unit tests asserting the calls made within the tx.
  prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
    if (typeof cb === 'function') {
      return await (cb as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
    }
    return undefined;
  });
});

describe('scripts/make-superadmin [Wave 2]', () => {
  it('promotes existing user to SUPERADMIN and writes BOOTSTRAP_SUPERADMIN AdminAction', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_seed_1',
      email: 'promote@test.local',
      role: 'USER',
    } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.adminAction.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['promote@test.local'], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_seed_1' },
      data: { role: 'SUPERADMIN' },
    });
    expect(prismaMock.adminAction.create).toHaveBeenCalledTimes(1);
    const auditCall = prismaMock.adminAction.create.mock.calls[0]?.[0];
    expect(auditCall?.data).toMatchObject({
      actorId: 'user_seed_1',
      action: 'BOOTSTRAP_SUPERADMIN',
      targetType: 'User',
      targetId: 'user_seed_1',
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Promoted promote@test.local'));
    logSpy.mockRestore();
  });

  it('creates new user when missing (instead of error)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'new_user_1',
      email: 'newuser@test.local',
      role: 'SUPERADMIN',
    } as never);
    prismaMock.adminAction.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['newuser@test.local'], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'newuser@test.local',
          role: 'SUPERADMIN',
        }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledTimes(1);
    logSpy.mockRestore();
  });

  it('already-SUPERADMIN is a no-op (idempotent) and logs "already SUPERADMIN"', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'super_seed_1',
      email: 'super@test.local',
      role: 'SUPERADMIN',
    } as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['super@test.local'], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.adminAction.create).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/already SUPERADMIN/i));
    logSpy.mockRestore();
  });

  it('AdminAction.metadata includes { via: "cli-script" }', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_seed_2',
      email: 'meta@test.local',
      role: 'ADMIN',
    } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.adminAction.create.mockResolvedValue({} as never);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['meta@test.local'], { prisma: prismaMock });

    expect(code).toBe(0);
    const auditCall = prismaMock.adminAction.create.mock.calls[0]?.[0];
    expect(auditCall?.data.metadata).toMatchObject({
      via: 'cli-script',
      previousRole: 'ADMIN',
    });
  });

  it('missing-arg path exits 1 with usage message', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('creates the user as SUPERADMIN with a printed temp password when absent', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'new_superadmin_1',
      email: 'jeffyengo@gmail.com',
      role: 'SUPERADMIN',
    } as never);
    prismaMock.adminAction.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main(['jeffyengo@gmail.com'], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'jeffyengo@gmail.com',
          role: 'SUPERADMIN',
        }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledTimes(1);
    const auditCall = prismaMock.adminAction.create.mock.calls[0]?.[0];
    expect(auditCall?.data).toMatchObject({
      actorId: 'new_superadmin_1',
      action: 'BOOTSTRAP_SUPERADMIN',
      targetType: 'User',
      targetId: 'new_superadmin_1',
      metadata: expect.objectContaining({
        via: 'cli-script',
        created: true,
        previousRole: null,
      }),
    });
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Created SUPERADMIN'))).toBe(true);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Temporary password'))).toBe(true);
    logSpy.mockRestore();
  });
});
