-- Backfill: apps that existed before the review workflow was introduced were already public, keep them that way
UPDATE "PwaApp" SET "status" = 'APPROVED' WHERE "submittedById" IS NULL;
