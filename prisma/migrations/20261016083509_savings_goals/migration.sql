-- Phase 8: savings goals (earmark model, Q-7 A).

-- AlterTable
ALTER TABLE "savings_contributions" ADD COLUMN     "client_request_id" UUID,
ALTER COLUMN "note" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "savings_goals" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ADD COLUMN     "note" VARCHAR(500),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(60);

-- CreateIndex
CREATE UNIQUE INDEX "savings_contributions_user_id_client_request_id_key" ON "savings_contributions"("user_id", "client_request_id");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_is_archived_idx" ON "savings_goals"("user_id", "is_archived");


-- Existing archived goals get an archive time so the consistency check holds.
UPDATE "savings_goals" SET "archived_at" = "updated_at" WHERE "is_archived" AND "archived_at" IS NULL;

-- Hand-written integrity constraints (docs/DATABASE.md §5).
ALTER TABLE "savings_goals"
  ADD CONSTRAINT "savings_goals_target_max_chk" CHECK ("target_amount_minor" <= 999999999999999),
  ADD CONSTRAINT "savings_goals_archived_consistent_chk" CHECK ("is_archived" = ("archived_at" IS NOT NULL));

ALTER TABLE "savings_contributions"
  ADD CONSTRAINT "savings_contributions_amount_range_chk"
    CHECK ("amount_minor" BETWEEN -999999999999999 AND 999999999999999);
