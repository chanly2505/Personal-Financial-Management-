-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(60);

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(40),
ALTER COLUMN "color" SET DATA TYPE VARCHAR(16);

-- CreateIndex
CREATE INDEX "accounts_user_id_is_archived_idx" ON "accounts"("user_id", "is_archived");

-- CreateIndex
CREATE INDEX "categories_user_id_type_is_archived_idx" ON "categories"("user_id", "type", "is_archived");


-- Hand-written integrity constraints (docs/DATABASE.md §5).
-- Archived flag and timestamp always agree.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_archived_consistent_chk" CHECK ("is_archived" = ("archived_at" IS NOT NULL)),
  ADD CONSTRAINT "accounts_opening_balance_range_chk"
    CHECK ("opening_balance_minor" BETWEEN -999999999999999 AND 999999999999999);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_archived_consistent_chk" CHECK ("is_archived" = ("archived_at" IS NOT NULL)),
  ADD CONSTRAINT "categories_color_token_chk"
    CHECK ("color" IS NULL OR "color" IN ('chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'));
