CREATE TYPE "RunnerJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'UPLOADED', 'IMPORTED', 'FAILED', 'CANCELLED', 'SKIPPED');

CREATE TABLE "Runner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT,
    "tokenHint" TEXT,
    "arch" TEXT,
    "hostname" TEXT,
    "os" TEXT,
    "version" TEXT,
    "concurrency" INTEGER,
    "lastSeenAt" TIMESTAMP(3),
    "lastIp" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Runner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunnerJob" (
    "id" TEXT NOT NULL,
    "flatpakBuildId" TEXT NOT NULL,
    "arch" TEXT NOT NULL,
    "status" "RunnerJobStatus" NOT NULL DEFAULT 'QUEUED',
    "runnerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "log" TEXT NOT NULL DEFAULT '',
    "logBytes" INTEGER NOT NULL DEFAULT 0,
    "artifactPath" TEXT,
    "artifactSize" BIGINT NOT NULL DEFAULT 0,
    "gitCommit" TEXT,
    "metainfoB64" TEXT,
    "iconB64" TEXT,
    "refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunnerJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Runner_tokenHash_key" ON "Runner"("tokenHash");

CREATE INDEX "RunnerJob_status_arch_idx" ON "RunnerJob"("status", "arch");

CREATE INDEX "RunnerJob_runnerId_idx" ON "RunnerJob"("runnerId");

CREATE INDEX "RunnerJob_flatpakBuildId_idx" ON "RunnerJob"("flatpakBuildId");

ALTER TABLE "Runner" ADD CONSTRAINT "Runner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RunnerJob" ADD CONSTRAINT "RunnerJob_flatpakBuildId_fkey" FOREIGN KEY ("flatpakBuildId") REFERENCES "FlatpakBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RunnerJob" ADD CONSTRAINT "RunnerJob_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Runner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
