-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
COMMENT ON COLUMN "CreditTransaction"."type" IS 'PURCHASE | SPEND | ADMIN_GRANT | WELCOME_GIFT | REFERRAL_CONVERSION';

-- CreateTable
CREATE TABLE "ReferralBonus" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralBonus_referredUserId_key" ON "ReferralBonus"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralBonus_referrerId_createdAt_idx" ON "ReferralBonus"("referrerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferralBonus" ADD CONSTRAINT "ReferralBonus_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralBonus" ADD CONSTRAINT "ReferralBonus_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
