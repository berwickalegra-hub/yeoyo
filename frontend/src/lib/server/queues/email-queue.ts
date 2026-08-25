/**
 * EmailQueue — durable email send pipeline.
 *
 * Combines two persistence layers:
 *   1. EmailJob row (Postgres) — full payload + status (PENDING/SENT/FAILED/DEAD).
 *      Survives Redis flushes; queryable for ops dashboards.
 *   2. JobQueue (Redis list) — work-to-do pointer holding only the EmailJob id.
 *      Survives backend restart.
 *
 * `enqueue(input)` writes the row first, then pushes the id. `processNext`
 * loads the row, calls the mailer, then transitions status. Dead-letter
 * marks the row DEAD so an operator can replay it later.
 */
import type { Redis } from '@upstash/redis';
import type { PrismaClient } from '@prisma/client';
import { JobQueue, type QueueJob } from './job-queue';
import type { Mailer, SendEmailInput } from '../email';

export interface EmailJobPayload {
  emailJobId: string;
}

export interface EmailQueueOptions {
  redis: Redis;
  prisma: PrismaClient;
  mailer: Mailer;
  /** Defaults to 5. */
  maxAttempts?: number;
  /** Defaults to "email". */
  name?: string;
  /** Per-attempt backoff. Defaults to 30s, 2m, 10m, 30m, 1h. */
  retryDelaysMs?: readonly number[];
  /** Visibility timeout for stuck jobs. Default 5 min. */
  visibilityMs?: number;
}

const DEFAULT_EMAIL_RETRY_DELAYS_MS: readonly number[] = [
  30_000, // 30s
  2 * 60_000, // 2 min
  10 * 60_000, // 10 min
  30 * 60_000, // 30 min
  60 * 60_000, // 1 h
];

export class EmailQueue extends JobQueue<EmailJobPayload> {
  private readonly prisma: PrismaClient;
  private readonly mailer: Mailer;

  constructor(opts: EmailQueueOptions) {
    super({
      redis: opts.redis,
      name: opts.name ?? 'email',
      maxAttempts: opts.maxAttempts ?? 5,
      retryDelaysMs: opts.retryDelaysMs ?? DEFAULT_EMAIL_RETRY_DELAYS_MS,
      ...(opts.visibilityMs !== undefined ? { visibilityMs: opts.visibilityMs } : {}),
      onDeadLetter: async (job: QueueJob<EmailJobPayload>, lastError: unknown) => {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        try {
          await opts.prisma.emailJob.update({
            where: { id: job.payload.emailJobId },
            data: { status: 'DEAD', lastError: message },
          });
        } catch {
          // Row may have been deleted manually; swallow — already dropped from queue.
        }
      },
    });
    this.prisma = opts.prisma;
    this.mailer = opts.mailer;
  }

  /**
   * Persist the email payload + push the work pointer in one call.
   * Returns the EmailJob row id for callers that want to track status.
   */
  async enqueue(input: SendEmailInput): Promise<string> {
    const data: {
      to: string;
      subject: string;
      html: string;
      status: string;
      text?: string;
    } = {
      to: input.to,
      subject: input.subject,
      html: input.html,
      status: 'PENDING',
    };
    if (input.text !== undefined) data.text = input.text;

    const row = await this.prisma.emailJob.create({ data });
    await this.push({ emailJobId: row.id });
    return row.id;
  }

  /**
   * Send the most recently enqueued PENDING job addressed to `to`, right
   * now, bypassing the Redis FIFO order.
   *
   * 2026-08-26: `drainOne()` always pops whatever is at the HEAD of the
   * shared queue — under any backlog (which the once-daily Vercel Hobby
   * cron guarantees will exist, see drain-now.ts's file header), a caller
   * who just enqueued their own code and immediately asked for an
   * immediate send would instead trigger delivery of someone ELSE's older
   * queued email, while their own sits at the back waiting for the next
   * trigger. Confirmed against prod: a user's signup code sat PENDING for
   * hours while each of their own follow-up actions (resend, a later
   * signup) kept flushing a different, older backlogged recipient's email
   * instead of their own. This targets the specific row instead, so the
   * person actively watching a "check your email" screen reliably gets
   * their own code, independent of backlog size or FIFO position.
   *
   * The Redis pointer pushed by `enqueue()` for this row is left in place —
   * when it's eventually popped (by `drainOne()` or the cron), the
   * status === 'SENT' guard below (same one `drainOne()` checks) makes that
   * a no-op, so there's no double-send.
   *
   * Returns true if a job was found and sent (or terminally failed), false
   * if there was nothing PENDING for `to`.
   */
  async sendPendingFor(to: string): Promise<boolean> {
    const row = await this.prisma.emailJob.findFirst({
      where: { to, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return false;

    try {
      const sendInput: SendEmailInput = { to: row.to, subject: row.subject, html: row.html };
      if (row.text !== null) sendInput.text = row.text;

      await this.mailer.send(sendInput);

      await this.prisma.emailJob.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1 },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.emailJob.update({
        where: { id: row.id },
        data: { status: 'FAILED', lastError: message, attempts: row.attempts + 1 },
      });
    }
    return true;
  }

  /**
   * Drain one job from the queue. Returns true if a job was processed
   * (success OR failure), false if the queue was empty. Wrap in a loop +
   * setInterval at the call site.
   */
  async drainOne(): Promise<boolean> {
    return this.processNext(async (payload) => {
      const row = await this.prisma.emailJob.findUnique({ where: { id: payload.emailJobId } });
      if (!row) {
        // Row deleted out from under us — nothing to do; treat as success so
        // it isn't re-enqueued.
        return;
      }
      if (row.status === 'SENT' || row.status === 'DEAD') {
        // Idempotent: already terminal.
        return;
      }

      try {
        const sendInput: SendEmailInput = {
          to: row.to,
          subject: row.subject,
          html: row.html,
        };
        if (row.text !== null) sendInput.text = row.text;

        await this.mailer.send(sendInput);

        await this.prisma.emailJob.update({
          where: { id: row.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1 },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.emailJob.update({
          where: { id: row.id },
          data: { status: 'FAILED', lastError: message, attempts: row.attempts + 1 },
        });
        // Re-throw so JobQueue increments its own attempts counter and
        // either re-enqueues or dead-letters.
        throw err;
      }
    });
  }
}
