-- Phase 5: dashboard aggregations.
-- Replaces transactions (user_id, occurred_on DESC) with a wider index that has the
-- same leading columns (so ledger date ordering is unchanged) plus the columns the
-- dashboard sums, making those queries index-only. Measured on 400k rows
-- (20k for one user): "this year" cash flow 13.6 ms → 3.0 ms; heap reads 3,371 → 0.
-- Created before the old index is dropped, so there is no window without one.

-- CreateIndex
CREATE INDEX "transactions_user_date_covering_idx" ON "transactions"("user_id", "occurred_on" DESC, "type", "account_id", "category_id", "amount_minor");

-- DropIndex
DROP INDEX "transactions_user_id_occurred_on_idx";
