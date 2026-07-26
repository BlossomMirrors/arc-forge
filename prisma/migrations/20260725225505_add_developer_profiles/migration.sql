-- AlterTable
ALTER TABLE "PwaApp" ADD COLUMN     "developerProfileId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "activeDeveloperProfileId" TEXT;

-- CreateTable
CREATE TABLE "DeveloperProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperProfileMember" (
    "id" TEXT NOT NULL,
    "developerProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperProfileMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperProfileInvitation" (
    "id" TEXT NOT NULL,
    "developerProfileId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "DeveloperProfileInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperProfile_slug_key" ON "DeveloperProfile"("slug");

-- CreateIndex
CREATE INDEX "DeveloperProfileMember_developerProfileId_idx" ON "DeveloperProfileMember"("developerProfileId");

-- CreateIndex
CREATE INDEX "DeveloperProfileMember_userId_idx" ON "DeveloperProfileMember"("userId");

-- CreateIndex
CREATE INDEX "DeveloperProfileInvitation_developerProfileId_idx" ON "DeveloperProfileInvitation"("developerProfileId");

-- CreateIndex
CREATE INDEX "DeveloperProfileInvitation_email_idx" ON "DeveloperProfileInvitation"("email");

-- AddForeignKey
ALTER TABLE "DeveloperProfileMember" ADD CONSTRAINT "DeveloperProfileMember_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperProfileMember" ADD CONSTRAINT "DeveloperProfileMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperProfileInvitation" ADD CONSTRAINT "DeveloperProfileInvitation_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperProfileInvitation" ADD CONSTRAINT "DeveloperProfileInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PwaApp" ADD CONSTRAINT "PwaApp_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "DeveloperProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
