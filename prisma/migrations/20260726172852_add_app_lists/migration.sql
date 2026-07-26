-- CreateTable
CREATE TABLE "AppList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "appRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppList_createdById_idx" ON "AppList"("createdById");

-- CreateIndex
CREATE INDEX "AppListItem_listId_idx" ON "AppListItem"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "AppListItem_listId_appRef_key" ON "AppListItem"("listId", "appRef");

-- AddForeignKey
ALTER TABLE "AppList" ADD CONSTRAINT "AppList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppListItem" ADD CONSTRAINT "AppListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "AppList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

