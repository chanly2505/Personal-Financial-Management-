-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'KHR');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'DIGITAL_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT NOT NULL,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "base_currency" "Currency" NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Phnom_Penh',
    "exchange_rate_khr_per_usd" DECIMAL(12,4) NOT NULL DEFAULT 4100,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" "Currency" NOT NULL,
    "opening_balance_minor" BIGINT NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "color" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "description" TEXT,
    "recurring_rule_id" UUID,
    "recurrence_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "from_amount_minor" BIGINT NOT NULL,
    "to_amount_minor" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "description" TEXT,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "start_on" DATE NOT NULL,
    "end_on" DATE,
    "next_occurrence_on" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "category_type" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
    "month" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "target_amount_minor" BIGINT NOT NULL,
    "target_date" DATE,
    "account_id" UUID,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_contributions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_id_user_id_key" ON "accounts"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_type_name_key" ON "categories"("user_id", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_type_key" ON "categories"("id", "user_id", "type");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_on_idx" ON "transactions"("user_id", "occurred_on" DESC);

-- CreateIndex
CREATE INDEX "transactions_account_id_occurred_on_idx" ON "transactions"("account_id", "occurred_on");

-- CreateIndex
CREATE INDEX "transactions_user_id_category_id_occurred_on_idx" ON "transactions"("user_id", "category_id", "occurred_on");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurring_rule_id_recurrence_date_key" ON "transactions"("recurring_rule_id", "recurrence_date");

-- CreateIndex
CREATE INDEX "transfers_user_id_occurred_on_idx" ON "transfers"("user_id", "occurred_on" DESC);

-- CreateIndex
CREATE INDEX "transfers_from_account_id_occurred_on_idx" ON "transfers"("from_account_id", "occurred_on");

-- CreateIndex
CREATE INDEX "transfers_to_account_id_occurred_on_idx" ON "transfers"("to_account_id", "occurred_on");

-- CreateIndex
CREATE INDEX "recurring_rules_user_id_idx" ON "recurring_rules"("user_id");

-- CreateIndex
CREATE INDEX "recurring_rules_is_active_next_occurrence_on_idx" ON "recurring_rules"("is_active", "next_occurrence_on");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_rules_id_user_id_key" ON "recurring_rules"("id", "user_id");

-- CreateIndex
CREATE INDEX "budgets_user_id_month_idx" ON "budgets"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_month_currency_key" ON "budgets"("user_id", "category_id", "month", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "savings_goals_user_id_name_key" ON "savings_goals"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "savings_goals_id_user_id_key" ON "savings_goals"("id", "user_id");

-- CreateIndex
CREATE INDEX "savings_contributions_goal_id_occurred_on_idx" ON "savings_contributions"("goal_id", "occurred_on");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_user_id_type_fkey" FOREIGN KEY ("category_id", "user_id", "type") REFERENCES "categories"("id", "user_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_user_id_fkey" FOREIGN KEY ("recurring_rule_id", "user_id") REFERENCES "recurring_rules"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_user_id_fkey" FOREIGN KEY ("from_account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_user_id_fkey" FOREIGN KEY ("to_account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_user_id_type_fkey" FOREIGN KEY ("category_id", "user_id", "type") REFERENCES "categories"("id", "user_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_user_id_category_type_fkey" FOREIGN KEY ("category_id", "user_id", "category_type") REFERENCES "categories"("id", "user_id", "type") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "savings_goals"("id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written integrity constraints (Prisma cannot express CHECK constraints).
-- Keep in sync with DATABASE.md and tests/integration/schema-constraints.test.ts.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "users_exchange_rate_positive_chk" CHECK ("exchange_rate_khr_per_usd" > 0);

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_name_not_blank_chk" CHECK (length(btrim("name")) > 0);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_not_blank_chk" CHECK (length(btrim("name")) > 0);

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_positive_chk" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "transactions_recurrence_pair_chk"
    CHECK (("recurring_rule_id" IS NULL) = ("recurrence_date" IS NULL));

ALTER TABLE "transfers"
  ADD CONSTRAINT "transfers_amounts_positive_chk" CHECK ("from_amount_minor" > 0 AND "to_amount_minor" > 0),
  ADD CONSTRAINT "transfers_distinct_accounts_chk" CHECK ("from_account_id" <> "to_account_id");

ALTER TABLE "recurring_rules"
  ADD CONSTRAINT "recurring_rules_amount_positive_chk" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "recurring_rules_interval_range_chk" CHECK ("interval" BETWEEN 1 AND 365),
  ADD CONSTRAINT "recurring_rules_end_after_start_chk" CHECK ("end_on" IS NULL OR "end_on" >= "start_on");

ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_amount_positive_chk" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "budgets_expense_only_chk" CHECK ("category_type" = 'EXPENSE'),
  ADD CONSTRAINT "budgets_month_first_day_chk" CHECK (EXTRACT(DAY FROM "month") = 1);

ALTER TABLE "savings_goals"
  ADD CONSTRAINT "savings_goals_target_positive_chk" CHECK ("target_amount_minor" > 0),
  ADD CONSTRAINT "savings_goals_name_not_blank_chk" CHECK (length(btrim("name")) > 0);

ALTER TABLE "savings_contributions"
  ADD CONSTRAINT "savings_contributions_amount_nonzero_chk" CHECK ("amount_minor" <> 0);
