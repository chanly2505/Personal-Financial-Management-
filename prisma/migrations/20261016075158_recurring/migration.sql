-- Phase 7: recurring rules (name, status, pause reason, payee) and execution history.

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "RecurringPauseReason" AS ENUM ('USER', 'ACCOUNT_ARCHIVED', 'CATEGORY_ARCHIVED', 'REPEATED_FAILURES');
CREATE TYPE "RecurringRunStatus" AS ENUM ('POSTED', 'FAILED', 'SKIPPED');

-- AlterTable: new columns first, then backfill from is_active, then drop it.
ALTER TABLE "recurring_rules"
  ADD COLUMN "name" VARCHAR(60),
  ADD COLUMN "pause_reason" "RecurringPauseReason",
  ADD COLUMN "paused_at" TIMESTAMPTZ(3),
  ADD COLUMN "payee" VARCHAR(80),
  ADD COLUMN "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
  ALTER COLUMN "description" SET DATA TYPE VARCHAR(500);

UPDATE "recurring_rules" SET "name" = COALESCE(NULLIF(btrim(left("description", 60)), ''), 'Recurring');
UPDATE "recurring_rules" SET "status" = 'COMPLETED' WHERE "next_occurrence_on" IS NULL;
UPDATE "recurring_rules" SET "status" = 'PAUSED', "pause_reason" = 'USER', "paused_at" = now()
  WHERE "is_active" = false AND "next_occurrence_on" IS NOT NULL;

ALTER TABLE "recurring_rules" ALTER COLUMN "name" SET NOT NULL;
DROP INDEX "recurring_rules_is_active_next_occurrence_on_idx";
ALTER TABLE "recurring_rules" DROP COLUMN "is_active";
CREATE INDEX "recurring_rules_status_next_occurrence_on_idx" ON "recurring_rules"("status", "next_occurrence_on");

-- CreateTable
CREATE TABLE "recurring_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "occurrence_on" DATE NOT NULL,
    "status" "RecurringRunStatus" NOT NULL,
    "transaction_id" UUID,
    "reason" VARCHAR(64),
    "attempts" SMALLINT NOT NULL DEFAULT 1,
    "last_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recurring_runs_user_id_status_last_attempt_at_idx" ON "recurring_runs"("user_id", "status", "last_attempt_at" DESC);
CREATE UNIQUE INDEX "recurring_runs_rule_id_occurrence_on_key" ON "recurring_runs"("rule_id", "occurrence_on");

-- AddForeignKey
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_rule_id_user_id_fkey" FOREIGN KEY ("rule_id", "user_id") REFERENCES "recurring_rules"("id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Hand-written integrity constraints (docs/DATABASE.md §5).
ALTER TABLE "recurring_rules"
  ADD CONSTRAINT "recurring_rules_name_not_blank_chk" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "recurring_rules_amount_max_chk" CHECK ("amount_minor" <= 999999999999999),
  -- COMPLETED exactly when there is no next occurrence.
  ADD CONSTRAINT "recurring_rules_completed_chk" CHECK (("status" = 'COMPLETED') = ("next_occurrence_on" IS NULL)),
  -- A pause reason and time exactly when PAUSED.
  ADD CONSTRAINT "recurring_rules_pause_reason_chk" CHECK (("status" = 'PAUSED') = ("pause_reason" IS NOT NULL)),
  ADD CONSTRAINT "recurring_rules_paused_at_chk" CHECK (("status" = 'PAUSED') = ("paused_at" IS NOT NULL)),
  ADD CONSTRAINT "recurring_rules_next_in_range_chk"
    CHECK ("next_occurrence_on" IS NULL OR ("next_occurrence_on" >= "start_on" AND ("end_on" IS NULL OR "next_occurrence_on" <= "end_on")));

ALTER TABLE "recurring_runs"
  ADD CONSTRAINT "recurring_runs_attempts_positive_chk" CHECK ("attempts" > 0),
  ADD CONSTRAINT "recurring_runs_posted_has_no_reason_chk" CHECK ("status" <> 'POSTED' OR "reason" IS NULL),
  ADD CONSTRAINT "recurring_runs_reason_required_chk" CHECK ("status" = 'POSTED' OR "reason" IS NOT NULL);
