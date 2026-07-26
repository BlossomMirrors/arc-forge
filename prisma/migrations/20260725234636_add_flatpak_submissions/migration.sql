-- CreateEnum
CREATE TYPE "FlatpakStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "FlatpakApp" (
    "id" TEXT NOT NULL,
    "appid" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'stable',
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconUrl" TEXT NOT NULL,
    "screenshots" TEXT[],
    "homepageUrl" TEXT NOT NULL DEFAULT '',
    "contentRating" TEXT NOT NULL DEFAULT 'All ages',
    "developerName" TEXT NOT NULL,
    "developerProfileId" TEXT,
    "bundleUrl" TEXT NOT NULL,
    "bundleFileName" TEXT NOT NULL,
    "bundleSize" INTEGER NOT NULL,
    "status" "FlatpakStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "buildLog" TEXT,
    "buildStartedAt" TIMESTAMP(3),
    "buildFinishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlatpakApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfraSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sshPublicKey" TEXT,
    "sshPrivateKeyEncrypted" TEXT,
    "gpgPassphraseEncrypted" TEXT,
    "remoteHost" TEXT NOT NULL DEFAULT 'repo.blossomos.org',
    "remoteRepoPath" TEXT NOT NULL DEFAULT '/srv/repos/flatpak',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfraSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlatpakApp_appid_key" ON "FlatpakApp"("appid");

-- CreateIndex
CREATE INDEX "FlatpakApp_status_idx" ON "FlatpakApp"("status");

-- AddForeignKey
ALTER TABLE "FlatpakApp" ADD CONSTRAINT "FlatpakApp_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "DeveloperProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlatpakApp" ADD CONSTRAINT "FlatpakApp_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlatpakApp" ADD CONSTRAINT "FlatpakApp_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
