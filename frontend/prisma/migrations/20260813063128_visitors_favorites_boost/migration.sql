-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "boostedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Favorite_targetId_idx" ON "Favorite"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_targetId_key" ON "Favorite"("userId", "targetId");

-- CreateIndex
CREATE INDEX "ProfileView_viewedId_createdAt_idx" ON "ProfileView"("viewedId", "createdAt");

-- CreateIndex
CREATE INDEX "ProfileView_viewerId_idx" ON "ProfileView"("viewerId");

-- CreateIndex
CREATE INDEX "Profile_boostedUntil_idx" ON "Profile"("boostedUntil");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewedId_fkey" FOREIGN KEY ("viewedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
