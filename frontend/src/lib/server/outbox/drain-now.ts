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

export async function drainOutboxNow(): Promise<void> {
  try {
    const queue = getEmailQueue();
    await drainOutbox(
      { prisma, ...(queue ? { emailQueue: queue } : {}) },
      IMMEDIATE_DRAIN_BATCH_SIZE,
    );
  } catch (err) {
    log.warn(
      'drainOutboxNow: best-effort immediate drain failed, daily cron remains the fallback',
      {
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }
}
