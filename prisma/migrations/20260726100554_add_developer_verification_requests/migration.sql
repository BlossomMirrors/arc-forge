-- CreateEnum
CREATE TYPE "VerificationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "DeveloperVerificationRequest" (
    "id" TEXT NOT NULL,
    "developerProfileId" TEXT NOT NULL,
    "dunsNumber" TEXT NOT NULL,
    "documentUrls" TEXT[],
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeveloperVerificationRequest_developerProfileId_status_idx" ON "DeveloperVerificationRequest"("developerProfileId", "status");

-- CreateIndex
CREATE INDEX "DeveloperVerificationRequest_status_idx" ON "DeveloperVerificationRequest"("status");

-- AddForeignKey
ALTER TABLE "DeveloperVerificationRequest" ADD CONSTRAINT "DeveloperVerificationRequest_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperVerificationRequest" ADD CONSTRAINT "DeveloperVerificationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperVerificationRequest" ADD CONSTRAINT "DeveloperVerificationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

