-- AlterTable
ALTER TABLE "AdminInvite" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "affiliateCode" TEXT,
ADD COLUMN     "referredByAffiliateId" TEXT;

-- CreateTable
CREATE TABLE "AffiliateEarning" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "relatedOrderId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliateEarning_affiliateId_paidAt_idx" ON "AffiliateEarning"("affiliateId", "paidAt");

-- CreateIndex
CREATE INDEX "AffiliateEarning_referredUserId_type_idx" ON "AffiliateEarning"("referredUserId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "User_affiliateCode_key" ON "User"("affiliateCode");

-- CreateIndex
CREATE INDEX "User_affiliateCode_idx" ON "User"("affiliateCode");

-- CreateIndex
CREATE INDEX "User_referredByAffiliateId_idx" ON "User"("referredByAffiliateId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByAffiliateId_fkey" FOREIGN KEY ("referredByAffiliateId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateEarning" ADD CONSTRAINT "AffiliateEarning_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateEarning" ADD CONSTRAINT "AffiliateEarning_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforces "at most one verification bonus per referred user, ever" at the
-- database level, as a failsafe alongside the application-level check in
-- POST /api/admin/verification-queue/[id]/process (Task 10). Does NOT
-- constrain CREDIT_COMMISSION rows — a user can have many of those (one
-- per purchase inside the 30-day window).
CREATE UNIQUE INDEX "AffiliateEarning_one_verification_bonus_per_user"
  ON "AffiliateEarning" ("referredUserId")
  WHERE "type" = 'VERIFICATION_BONUS';
