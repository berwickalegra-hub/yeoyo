// DELETE /api/account — Paramètres "Supprimer mon compte" (destructive,
// no undo). Password-holding accounts must confirm with their current
// password; OAuth-only accounts (no password to check) must re-type their
// own email as a lighter-weight confirmation against accidental clicks.
//
// Most domain rows cascade via the Prisma relations already declared
// on-delete (Profile, Like, ContactRequest, Conversation/Message,
// BlockedUser, Notification, OAuthAccount, VerificationCode). Order rows
// go to `userId: null` (guest-checkout-shaped, keeps financial history).
// Withdrawal/AdminAction use onDelete: Restrict — YeOyo never creates
// withdrawals and a self-deleting admin is out of scope for this route, so
// neither should fire in practice; if one does, the 500 surfaces a real
// data-integrity question rather than silently orphaning records.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { clearAuthCookies, clearCsrfCookie, verifyCsrf, verifyPassword } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  password: z.string().optional(),
  confirmEmail: z.string().optional(),
});

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) {
      return NextResponse.json(
        { code: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (user.passwordHash) {
      const ok =
        !!parsed.data.password && (await verifyPassword(parsed.data.password, user.passwordHash));
      if (!ok) {
        return NextResponse.json(
          { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    } else {
      const matches =
        !!parsed.data.confirmEmail &&
        parsed.data.confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
      if (!matches) {
        return NextResponse.json(
          { code: 'EMAIL_CONFIRMATION_MISMATCH', message: 'Email confirmation does not match' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    await prisma.user.delete({ where: { id: user.id } });

    await clearAuthCookies();
    await clearCsrfCookie();

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
