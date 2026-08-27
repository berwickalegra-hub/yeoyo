-- Enforces "at most one first-match bonus per referred user, ever" at the
-- database level, as a failsafe alongside the application-level check in
-- POST /api/contact-requests/[id]/respond. Mirrors
-- AffiliateEarning_one_verification_bonus_per_user (see
-- 20260826073426_affiliate_program). Does NOT constrain CREDIT_COMMISSION
-- rows — a user can have many of those (one per purchase inside the
-- 30-day window).
CREATE UNIQUE INDEX "AffiliateEarning_one_first_match_bonus_per_user"
  ON "AffiliateEarning" ("referredUserId")
  WHERE "type" = 'FIRST_MATCH_BONUS';
