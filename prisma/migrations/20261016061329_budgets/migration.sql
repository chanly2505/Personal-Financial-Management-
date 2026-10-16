-- Phase 6: budget management (archive, warning threshold, in-app alerts).

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "alert_threshold_percent" SMALLINT NOT NULL DEFAULT 80,
ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "budget_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "threshold_percent" SMALLINT NOT NULL,
    "spent_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_alerts_user_id_read_at_created_at_idx" ON "budget_alerts"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "budget_alerts_budget_id_threshold_percent_key" ON "budget_alerts"("budget_id", "threshold_percent");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_id_user_id_key" ON "budgets"("id", "user_id");

-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budgets"("id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Hand-written integrity constraints (docs/DATABASE.md §5).
ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_amount_max_chk" CHECK ("amount_minor" <= 999999999999999),
  ADD CONSTRAINT "budgets_alert_threshold_range_chk" CHECK ("alert_threshold_percent" BETWEEN 1 AND 100);

ALTER TABLE "budget_alerts"
  ADD CONSTRAINT "budget_alerts_threshold_range_chk" CHECK ("threshold_percent" BETWEEN 1 AND 100),
  ADD CONSTRAINT "budget_alerts_spent_positive_chk" CHECK ("spent_minor" > 0);
