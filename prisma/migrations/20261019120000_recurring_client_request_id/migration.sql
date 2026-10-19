-- FIN-1 (docs/financial-logic-audit.md): a double-submitted "new recurring rule"
-- must create one rule, like entries, transfers and contributions already do.
-- Additive only: existing rules keep a NULL request id (NULLs never conflict).
-- Rollback: DROP INDEX "recurring_rules_user_id_client_request_id_key";
--           ALTER TABLE "recurring_rules" DROP COLUMN "client_request_id";
ALTER TABLE "recurring_rules" ADD COLUMN "client_request_id" UUID;

CREATE UNIQUE INDEX "recurring_rules_user_id_client_request_id_key" ON "recurring_rules"("user_id", "client_request_id");
