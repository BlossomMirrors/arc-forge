-- AlterTable
ALTER TABLE "AppList" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AppList_slug_key" ON "AppList"("slug");

