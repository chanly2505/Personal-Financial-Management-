-- FIN-4 (docs/financial-logic-audit.md): enforce in the database two rules the
-- app already follows, so a future bug or a manual edit cannot break balances:
--   1. both accounts of a transfer use the same currency (v1 has no conversion);
--   2. an account's currency never changes once anything refers to it.
-- Additive (functions + triggers only); existing data was checked first: no
-- transfer joins accounts of different currencies.
-- Rollback:
--   DROP TRIGGER transfers_same_currency_trg ON transfers;
--   DROP TRIGGER accounts_currency_fixed_trg ON accounts;
--   DROP FUNCTION transfers_same_currency(); DROP FUNCTION accounts_currency_fixed();

CREATE FUNCTION transfers_same_currency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT currency FROM accounts WHERE id = NEW.from_account_id)
     IS DISTINCT FROM (SELECT currency FROM accounts WHERE id = NEW.to_account_id) THEN
    RAISE EXCEPTION 'transfer accounts must use the same currency'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'transfers_same_currency';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transfers_same_currency_trg
  BEFORE INSERT OR UPDATE OF from_account_id, to_account_id ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_same_currency();

CREATE FUNCTION accounts_currency_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency AND (
       EXISTS (SELECT 1 FROM transactions WHERE account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM transfers WHERE from_account_id = OLD.id OR to_account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM recurring_rules WHERE account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM savings_goals WHERE account_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'an account''s currency cannot change once it has records'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'accounts_currency_fixed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_currency_fixed_trg
  BEFORE UPDATE OF currency ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_currency_fixed();
