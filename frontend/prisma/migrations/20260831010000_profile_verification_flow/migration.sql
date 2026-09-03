-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "verificationSelfieKey" TEXT,
ADD COLUMN     "verificationCode" TEXT,
ADD COLUMN     "verificationSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "verificationRejectionReason" TEXT;

-- New default for the identity-verification lifecycle.
ALTER TABLE "Profile" ALTER COLUMN "verificationStatus" SET DEFAULT 'UNVERIFIED';

-- Backfill: every profile currently 'PENDING' predates the self-service
-- flow (nobody actually submitted a verification selfie) — move them to
-- 'UNVERIFIED' so the admin queue only ever contains real submissions.
UPDATE "Profile" SET "verificationStatus" = 'UNVERIFIED' WHERE "verificationStatus" = 'PENDING';
