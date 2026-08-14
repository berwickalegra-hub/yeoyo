-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "mutedByUserA" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mutedByUserB" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMP(3);
