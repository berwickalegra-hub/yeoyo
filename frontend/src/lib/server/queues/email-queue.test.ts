// 2026-08-26 — sendPendingFor is the fix for a confirmed prod bug: the
// once-daily cron (Vercel Hobby) plus a FIFO drainOne() meant a user's own
// just-enqueued verification code sat PENDING while an unrelated, older
// backlogged recipient's email went out instead whenever THIS user took
// another action. sendPendingFor targets the caller's own row directly —
// see drain-now.ts and email-queue.ts's doc comments for the full story.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from '@upstash/redis';
import { EmailQueue } from './email-queue';
import type { Mailer } from '../email';

function makeQueue(mailer: Mailer): EmailQueue {
  return new EmailQueue({
    redis: {} as Redis,
    prisma: prismaMock as never,
    mailer,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmailQueue.sendPendingFor', () => {
  it('sends the most recently created PENDING job addressed to `to` and marks it SENT', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'resend-1' });
    const queue = makeQueue({ send });
    prismaMock.emailJob.findFirst.mockResolvedValueOnce({
      id: 'job-1',
      to: 'josephyengo0001@gmail.com',
      subject: 'Verify your email',
      html: '<p>code</p>',
      text: null,
      attempts: 0,
    } as never);
    prismaMock.emailJob.update.mockResolvedValueOnce({} as never);

    const handled = await queue.sendPendingFor('josephyengo0001@gmail.com');

    expect(handled).toBe(true);
    expect(prismaMock.emailJob.findFirst).toHaveBeenCalledWith({
      where: { to: 'josephyengo0001@gmail.com', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    expect(send).toHaveBeenCalledWith({
      to: 'josephyengo0001@gmail.com',
      subject: 'Verify your email',
      html: '<p>code</p>',
    });
    expect(prismaMock.emailJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'SENT', sentAt: expect.any(Date), attempts: 1 },
    });
  });

  it('returns false without calling the mailer when nothing is PENDING for `to`', async () => {
    const send = vi.fn();
    const queue = makeQueue({ send });
    prismaMock.emailJob.findFirst.mockResolvedValueOnce(null);

    const handled = await queue.sendPendingFor('nobody@example.com');

    expect(handled).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('marks the row FAILED (not thrown) when the mailer rejects, so the queue can retry it later', async () => {
    const send = vi.fn().mockRejectedValue(new Error('resend 500'));
    const queue = makeQueue({ send });
    prismaMock.emailJob.findFirst.mockResolvedValueOnce({
      id: 'job-2',
      to: 'a@example.com',
      subject: 'Verify your email',
      html: '<p>code</p>',
      text: null,
      attempts: 0,
    } as never);
    prismaMock.emailJob.update.mockResolvedValueOnce({} as never);

    const handled = await queue.sendPendingFor('a@example.com');

    expect(handled).toBe(true);
    expect(prismaMock.emailJob.update).toHaveBeenCalledWith({
      where: { id: 'job-2' },
      data: { status: 'FAILED', lastError: 'resend 500', attempts: 1 },
    });
  });
});
