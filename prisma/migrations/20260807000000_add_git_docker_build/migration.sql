-- CreateEnum
CREATE TYPE "FlatpakBuildStage" AS ENUM ('BUILD', 'PUBLISH');

-- AlterTable
ALTER TABLE "FlatpakBuild" ADD COLUMN     "stage" "FlatpakBuildStage" NOT NULL DEFAULT 'PUBLISH';

-- AlterTable
ALTER TABLE "InfraSettings" ADD COLUMN     "buildDockerImage" TEXT NOT NULL DEFAULT 'ghcr.io/blossomos/forge-flatpak-builder:fedora44',
ADD COLUMN     "buildHost" TEXT,
ADD COLUMN     "buildUser" TEXT NOT NULL DEFAULT 'forge';
