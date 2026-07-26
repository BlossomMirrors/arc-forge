-- CreateEnum
CREATE TYPE "FlatpakSourceType" AS ENUM ('BUNDLE', 'GIT');

-- AlterTable
ALTER TABLE "FlatpakApp" ADD COLUMN     "gitBranch" TEXT,
ADD COLUMN     "gitLastCommit" TEXT,
ADD COLUMN     "gitManifestPath" TEXT,
ADD COLUMN     "gitUrl" TEXT,
ADD COLUMN     "sourceType" "FlatpakSourceType" NOT NULL DEFAULT 'BUNDLE',
ALTER COLUMN "bundleUrl" DROP NOT NULL,
ALTER COLUMN "bundleFileName" DROP NOT NULL,
ALTER COLUMN "bundleSize" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "FlatpakApp_sourceType_status_idx" ON "FlatpakApp"("sourceType", "status");
