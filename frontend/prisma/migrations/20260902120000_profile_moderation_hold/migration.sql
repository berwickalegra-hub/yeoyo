-- Profile moderation hold (soft-hide, distinct from User.status SUSPENDED).
ALTER TABLE "Profile" ADD COLUMN     "moderationHeldAt" TIMESTAMP(3),
ADD COLUMN     "moderationReason" TEXT;

CREATE INDEX "Profile_moderationHeldAt_idx" ON "Profile"("moderationHeldAt");
