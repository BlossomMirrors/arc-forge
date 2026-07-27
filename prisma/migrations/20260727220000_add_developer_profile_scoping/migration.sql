-- AlterTable
ALTER TABLE "AppList" ADD COLUMN     "developerProfileId" TEXT;

-- AlterTable
ALTER TABLE "ScreenshotSubmission" ADD COLUMN     "developerProfileId" TEXT;

-- CreateIndex
CREATE INDEX "AppList_developerProfileId_idx" ON "AppList"("developerProfileId");

-- CreateIndex
CREATE INDEX "FlatpakApp_developerProfileId_idx" ON "FlatpakApp"("developerProfileId");

-- CreateIndex
CREATE INDEX "PwaApp_developerProfileId_idx" ON "PwaApp"("developerProfileId");

-- CreateIndex
CREATE INDEX "ScreenshotSubmission_developerProfileId_idx" ON "ScreenshotSubmission"("developerProfileId");

-- AddForeignKey
ALTER TABLE "ScreenshotSubmission" ADD CONSTRAINT "ScreenshotSubmission_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "DeveloperProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppList" ADD CONSTRAINT "AppList_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "DeveloperProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
