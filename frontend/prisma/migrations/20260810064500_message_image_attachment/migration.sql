-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "body" SET DEFAULT '';
ALTER TABLE "Message" ADD COLUMN     "imageUploadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_imageUploadId_key" ON "Message"("imageUploadId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_imageUploadId_fkey" FOREIGN KEY ("imageUploadId") REFERENCES "FileUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
