// GET /api/coach/messages — the caller's coach thread (last 50 messages,
// chronological) + today's quota status. POST — send a message, get the
// AI's reply (or a clear error if unconfigured/unavailable).
//
// Free tier: FREE_DAILY_MESSAGE_LIMIT USER-role messages per UTC calendar
// day (counted via a createdAt range query — no separate counter row to
// keep in sync). ADMIN/SUPERADMIN are unlimited (2026-08-25: this used to
// bypass for ACTIVE Premium subscribers — the Subscription model is gone in
// favor of the credit system, and Coach isn't part of the new credit grid,
// so the bypass now follows the same staff-only pattern as
// lib/server/credits/ledger.ts instead of reintroducing a paid tier here).
// Inert (503 COACH_NOT_CONFIGURED) without ANTHROPIC_API_KEY, same
// optional-provider pattern as the rest of this kit — see
// lib/server/coach/anthropic.ts.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { askCoach, isCoachConfigured } from '@/lib/server/coach/anthropic';
import { startOfUtcDay, nextUtcMidnight } from '@/lib/server/daily-quota';

const FREE_DAILY_MESSAGE_LIMIT = 3;
const HISTORY_LIMIT = 50;

async function quotaStatus(
  userId: string,
): Promise<{ remaining: number | null; limit: number | null; resetAt: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const isStaff = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  if (isStaff) return { remaining: null, limit: null, resetAt: null };

  const usedToday = await prisma.coachMessage.count({
    where: { userId, role: 'USER', createdAt: { gte: startOfUtcDay() } },
  });
  return {
    remaining: Math.max(0, FREE_DAILY_MESSAGE_LIMIT - usedToday),
    limit: FREE_DAILY_MESSAGE_LIMIT,
    resetAt: nextUtcMidnight().toISOString(),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [messages, quota] = await Promise.all([
      prisma.coachMessage.findMany({
        where: { userId: auth.user.sub },
        orderBy: { createdAt: 'asc' },
        take: HISTORY_LIMIT,
      }),
      quotaStatus(auth.user.sub),
    ]);

    return NextResponse.json(
      {
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
        configured: isCoachConfigured(),
        ...quota,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const Body = z.object({ content: z.string().trim().min(1).max(1000) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    if (!isCoachConfigured()) {
      return NextResponse.json(
        { code: 'COACH_NOT_CONFIGURED', message: 'Le Coach IA n’est pas encore configuré.' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Message invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const quota = await quotaStatus(auth.user.sub);
    if (quota.limit !== null && (quota.remaining ?? 0) <= 0) {
      return NextResponse.json(
        {
          code: 'COACH_DAILY_LIMIT_REACHED',
          message: 'Tu as atteint la limite de questions gratuites pour aujourd’hui.',
          resetAt: quota.resetAt,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const userMessage = await prisma.coachMessage.create({
      data: { userId: auth.user.sub, role: 'USER', content: parsed.data.content },
    });

    const recentHistory = await prisma.coachMessage.findMany({
      where: { userId: auth.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const reply = await askCoach(
      recentHistory
        .slice()
        .reverse()
        .map((m) => ({ role: m.role as 'USER' | 'ASSISTANT', content: m.content })),
    );

    if (!reply) {
      return NextResponse.json(
        {
          code: 'COACH_UNAVAILABLE',
          message: 'Le Coach IA ne répond pas pour le moment, réessaie dans un instant.',
          userMessage: { id: userMessage.id, role: userMessage.role, content: userMessage.content },
        },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const assistantMessage = await prisma.coachMessage.create({
      data: { userId: auth.user.sub, role: 'ASSISTANT', content: reply },
    });

    const updatedQuota = await quotaStatus(auth.user.sub);

    return NextResponse.json(
      {
        userMessage: { id: userMessage.id, role: userMessage.role, content: userMessage.content },
        assistantMessage: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
        },
        ...updatedQuota,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
