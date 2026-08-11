-- AlterTable
ALTER TABLE "InfraSettings" ADD COLUMN     "flatpakRepoTitle" TEXT,
ADD COLUMN     "flatpakRepoHomepage" TEXT,
ADD COLUMN     "flatpakRepoComment" TEXT,
ADD COLUMN     "flatpakRepoDescription" TEXT,
ADD COLUMN     "flatpakRepoIconUrl" TEXT;
