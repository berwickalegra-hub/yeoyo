// Affiliate-role gate, sibling to require-admin.ts but deliberately NOT
// part of the USER < MODERATOR < ADMIN < SUPERADMIN rank ladder —
// AFFILIATE is an isolated role with its own space (/affilie/*), not a
// rank on the admin hierarchy. Chains requireAuth (same cookie/JWT/CSRF
// mechanics as every other role in the app — no new auth system) rather
// than re-reading the token/cookie itself, matching how requireAdmin
// chains requireAuth in middleware/index.ts.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireAuth } from './index';
import { prisma } from '../prisma';

export interface AffiliateContext {
  user: { sub: string; email: string };
  affiliate: { id: string; email: string; affiliateCode: string };
}

export async function requireAffiliate(
  authHeader?: string | null,
): Promise<AffiliateContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: { id: true, email: true, role: true, affiliateCode: true },
  });
  if (!user || user.role !== 'AFFILIATE' || !user.affiliateCode) {
    return NextResponse.json(
      { error: 'AFFILIATE_REQUIRED', message: 'Affiliate access required' },
      { status: 403 },
    );
  }
  return {
    user: auth.user,
    affiliate: { id: user.id, email: user.email, affiliateCode: user.affiliateCode },
  };
}
