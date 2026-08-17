// Vercel Hobby plan only allows daily cron schedules — frontend/vercel.json's
// outbox-drain/email-queue-drain crons run once a day, not the 1-minute
// cadence the code comments still describe. That leaves a verification-code
// email sitting in OutboxEvent for up to ~24h with the cron alone.
// 2026-08-18: confirmed directly against production — a signup's
// verification-code event sat PENDING for days.
//
// This is a best-effort, latency-bounded nudge to call right after
// `enqueueOutbox` for anything a user is actively waiting on (signup /
// forgot-password codes). It reuses the same PROTECTED drainOutbox
// (atomic per-row claim), just with a tiny batch and swallowed errors —
// if it fails or times out, the row is still durably PENDING and the daily
// cron remains the fallback. Never let this delay or fail the caller's own
// response.
import 'server-only';
import { prisma } from '../prisma';
import { drainOutbox } from './dispatcher';
import { getEmailQueue } from '../queues/email-queue-singleton';
import { createLogger } from '../logger';

const log = createLogger();
const IMMEDIATE_DRAIN_BATCH_SIZE = 3;
// Hard upper bound on how long this can delay the caller's own response —
// a slow/contended DB must never turn a "check your email" signup response
// into a multi-second hang. try/catch alone doesn't cover this: a stalled
// (not rejected) query would sail past it. Confirmed necessary in practice:
// concurrent requests each awaiting a real drainOutbox() call measurably
// added up under load (signup's own rate-limit test issues 6 requests at
// once) — 2026-08-18.
const MAX_WAIT_MS = 3000;

export async function drainOutboxNow(): Promise<void> {
  try {
    const queue = getEmailQueue();
    await Promise.race([
      drainOutbox({ prisma, ...(queue ? { emailQueue: queue } : {}) }, IMMEDIATE_DRAIN_BATCH_SIZE),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('drainOutboxNow: timed out')), MAX_WAIT_MS),
      ),
    ]);
  } catch (err) {
    log.warn(
      'drainOutboxNow: best-effort immediate drain failed, daily cron remains the fallback',
      {
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }
}
