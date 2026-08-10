-- DropIndex
DROP INDEX "FlatpakApp_appid_key";

-- CreateIndex
CREATE UNIQUE INDEX "FlatpakApp_appid_branch_key" ON "FlatpakApp"("appid", "branch");
