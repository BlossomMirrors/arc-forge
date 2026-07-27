-- CreateTable
CREATE TABLE "InfraAccessVerification" (
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfraAccessVerification_pkey" PRIMARY KEY ("sessionId")
);

