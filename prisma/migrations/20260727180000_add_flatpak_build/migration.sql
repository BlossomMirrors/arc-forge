-- CreateEnum
CREATE TYPE "FlatpakBuildResult" AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "FlatpakBuild" (
    "id" TEXT NOT NULL,
    "flatpakAppId" TEXT NOT NULL,
    "status" "FlatpakBuildResult" NOT NULL DEFAULT 'PROCESSING',
    "log" TEXT NOT NULL,
    "gitCommit" TEXT,
    "screenSessionName" TEXT NOT NULL,
    "remoteLogPath" TEXT NOT NULL,
    "remoteExitPath" TEXT NOT NULL,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FlatpakBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlatpakBuild_flatpakAppId_startedAt_idx" ON "FlatpakBuild"("flatpakAppId", "startedAt");

-- AddForeignKey
ALTER TABLE "FlatpakBuild" ADD CONSTRAINT "FlatpakBuild_flatpakAppId_fkey" FOREIGN KEY ("flatpakAppId") REFERENCES "FlatpakApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlatpakBuild" ADD CONSTRAINT "FlatpakBuild_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

