/*
  Warnings:

  - You are about to drop the column `remoteRepoPath` on the `InfraSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "InfraSettings" DROP COLUMN "remoteRepoPath",
ADD COLUMN     "r2BucketName" TEXT NOT NULL DEFAULT 'blossom-repos',
ADD COLUMN     "r2RepoPath" TEXT NOT NULL DEFAULT 'flatpak';
