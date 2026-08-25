-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "country" TEXT;

-- CreateIndex
CREATE INDEX "Profile_gender_country_idx" ON "Profile"("gender", "country");
