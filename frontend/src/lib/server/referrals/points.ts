// Central place for the peer-to-peer referral program's point economy
// (2026-08-31) — the only file that should ever hard-code these numbers.
// Consumed by POST /api/admin/verification-queue/[id]/process (where
// points are earned and auto-converted) and GET /api/referral/me (where a
// user's progress toward their next credit is displayed).
import 'server-only';

/** Points a referrer earns when their referred account passes verification. */
export const REFERRAL_POINTS_PER_VERIFICATION = 10;

/** Points that convert into exactly 1 credit, automatically, once reached. */
export const REFERRAL_POINTS_PER_CREDIT = 100;

/**
 * Max verified referrals that earn points for one referrer per calendar
 * month (UTC). Beyond this, a verified referral earns nothing — silent,
 * not an error.
 */
export const REFERRAL_MONTHLY_CAP = 10;
