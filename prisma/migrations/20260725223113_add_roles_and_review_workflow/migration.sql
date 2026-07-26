-- CreateEnum
CREATE TYPE "PwaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PwaApp" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "PwaStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "PwaApp_status_idx" ON "PwaApp"("status");

-- AddForeignKey
ALTER TABLE "PwaApp" ADD CONSTRAINT "PwaApp_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PwaApp" ADD CONSTRAINT "PwaApp_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
