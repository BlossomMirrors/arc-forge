-- CreateEnum
CREATE TYPE "ScreenshotStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ScreenshotSubmission" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" "ScreenshotStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenshotSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreenshotSubmission_status_idx" ON "ScreenshotSubmission"("status");

-- CreateIndex
CREATE INDEX "ScreenshotSubmission_submittedById_idx" ON "ScreenshotSubmission"("submittedById");

-- AddForeignKey
ALTER TABLE "ScreenshotSubmission" ADD CONSTRAINT "ScreenshotSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenshotSubmission" ADD CONSTRAINT "ScreenshotSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

