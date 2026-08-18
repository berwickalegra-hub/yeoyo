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
//
// 2026-08-18 follow-up: drainOutbox() only moves OutboxEvent -> EmailJob
// (EmailQueue.enqueue writes the row + pushes a Redis pointer — it does NOT
// call the mailer). Actual sending only happened via the *separate*
// email-queue-drain cron, which is also once-daily on Hobby and never runs
// at all under `pnpm dev` — so codes sat as EmailJob rows with status
// PENDING/attempts:0 forever locally, and up to ~24h in prod, even after
// this function's first version "fixed" the outbox stage. Draining the
// EmailQueue itself right after closes that second gap the same way.
import 'server-only';
import { prisma } from '../prisma';
import { drainOutbox } from './dispatcher';
import { getEmailQueue } from '../queues/email-queue-singleton';
import { createLogger } from '../logger';

const log = createLogger();
// Outbox stage is DB-only (claim + EmailJob insert + Redis LPUSH) — cheap,
// can afford to drain a few rows at once.
const IMMEDIATE_OUTBOX_BATCH_SIZE = 3;
// Email-send stage is a real network round trip per job (Redis claim + DB
// fetch + Resend HTTP call + DB update). Capped to 1 so the common case (the
// caller's own just-enqueued code) stays fast — draining a 3-job backlog
// serially here is what pushed this past 11s in practice (see MAX_WAIT_MS
// below) and starved the timeout before a single claim even landed.
const IMMEDIATE_EMAIL_SEND_LIMIT = 1;
// Hard upper bound on how long this can delay the caller's own response —
// a slow/contended DB must never turn a "check your email" signup response
// into a multi-second hang. try/catch alone doesn't cover this: a stalled
// (not rejected) query would sail past it.
// 2026-08-19: measured 11.1s end-to-end locally (Neon + Upstash + Resend,
// each a real network hop) with the old 5s ceiling — the timeout fired
// before a single job was ever claimed, so this "best-effort" nudge always
// lost the race and silently degraded to the once-daily cron fallback,
// which is itself broken on Vercel Hobby (see this file's other comments).
// That combination is the actual root cause behind reported "no verification
// / reset email" cases. Bumped to 12s (with the send-limit drop above) to
// comfortably clear the observed latency instead of guaranteeing a loss.
const MAX_WAIT_MS = 12000;

export async function drainOutboxNow(): Promise<void> {
  try {
    const queue = getEmailQueue();
    await Promise.race([
      (async () => {
        await drainOutbox(
          { prisma, ...(queue ? { emailQueue: queue } : {}) },
          IMMEDIATE_OUTBOX_BATCH_SIZE,
        );
        // Outbox stage above only wrote EmailJob row(s) + a Redis pointer —
        // actually call the mailer now instead of waiting for the daily cron.
        if (queue) {
          for (let i = 0; i < IMMEDIATE_EMAIL_SEND_LIMIT; i++) {
            const handled = await queue.drainOne();
            if (!handled) break; // queue empty
          }
        }
      })(),
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
