-- Phase 4: transaction ledger.
-- `description` is renamed (not dropped) to `note` so existing text is kept.

-- AlterTable: transactions
ALTER TABLE "transactions" RENAME COLUMN "description" TO "note";
ALTER TABLE "transactions"
  ALTER COLUMN "note" SET DATA TYPE VARCHAR(500),
  ADD COLUMN "payee" VARCHAR(80),
  ADD COLUMN "client_request_id" UUID;

-- AlterTable: transfers
ALTER TABLE "transfers" RENAME COLUMN "description" TO "note";
ALTER TABLE "transfers"
  ALTER COLUMN "note" SET DATA TYPE VARCHAR(500),
  ADD COLUMN "client_request_id" UUID,
  ADD COLUMN "reverses_transfer_id" UUID;

-- Idempotent creation: one row per (user, form submission).
CREATE UNIQUE INDEX "transactions_user_id_client_request_id_key" ON "transactions"("user_id", "client_request_id");
CREATE UNIQUE INDEX "transfers_user_id_client_request_id_key" ON "transfers"("user_id", "client_request_id");

-- Reversal link (same owner; each transfer reversed at most once).
CREATE UNIQUE INDEX "transfers_id_user_id_key" ON "transfers"("id", "user_id");
CREATE UNIQUE INDEX "transfers_reverses_transfer_id_user_id_key" ON "transfers"("reverses_transfer_id", "user_id");
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_reverses_transfer_id_user_id_fkey"
  FOREIGN KEY ("reverses_transfer_id", "user_id") REFERENCES "transfers"("id", "user_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Hand-written integrity constraints (docs/DATABASE.md §5).
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_max_chk" CHECK ("amount_minor" <= 999999999999999);

ALTER TABLE "transfers"
  ADD CONSTRAINT "transfers_amount_max_chk" CHECK ("from_amount_minor" <= 999999999999999 AND "to_amount_minor" <= 999999999999999),
  -- v1 policy: same-currency transfers only (docs/PRD.md §6.1), so both legs are equal.
  -- Drop this constraint when foreign-exchange transfers are implemented.
  ADD CONSTRAINT "transfers_same_amount_chk" CHECK ("from_amount_minor" = "to_amount_minor"),
  ADD CONSTRAINT "transfers_not_self_reversal_chk" CHECK ("reverses_transfer_id" IS NULL OR "reverses_transfer_id" <> "id");
