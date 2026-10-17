-- CreateEnum
CREATE TYPE "DateFormat" AS ENUM ('D_MMM_Y', 'MMM_D_Y', 'DD_MM_Y', 'ISO');

-- CreateEnum
CREATE TYPE "NumberFormat" AS ENUM ('COMMA_DOT', 'DOT_COMMA', 'SPACE_COMMA');

-- CreateEnum
CREATE TYPE "CurrencyDisplay" AS ENUM ('SYMBOL', 'CODE');

-- CreateEnum
CREATE TYPE "BudgetAlertMode" AS ENUM ('ALL', 'LIMIT_ONLY', 'OFF');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "budget_alert_mode" "BudgetAlertMode" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "currency_display" "CurrencyDisplay" NOT NULL DEFAULT 'SYMBOL',
ADD COLUMN     "date_format" "DateFormat" NOT NULL DEFAULT 'D_MMM_Y',
ADD COLUMN     "default_alert_threshold" SMALLINT NOT NULL DEFAULT 80,
ADD COLUMN     "number_format" "NumberFormat" NOT NULL DEFAULT 'COMMA_DOT';


-- Hand-written (docs/DATABASE.md §5): same range as a budget's own threshold.
ALTER TABLE "users"
  ADD CONSTRAINT "users_default_alert_threshold_range_chk"
  CHECK ("default_alert_threshold" BETWEEN 1 AND 100);
