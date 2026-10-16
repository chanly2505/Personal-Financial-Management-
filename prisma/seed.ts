/**
 * Local development seed: one demo user with realistic accounts, categories,
 * transactions, a transfer, a budget and a savings goal.
 *
 *   npm run db:seed
 *
 * - Idempotent: deletes and recreates only the demo user (cascade), leaving any
 *   other data untouched.
 * - Refuses to run when NODE_ENV=production or against a database whose name
 *   does not look like a development database.
 * - The demo user's password comes from SEED_DEMO_PASSWORD (min 10 characters).
 *   If unset, a random one is generated and printed once. No credentials are
 *   hard-coded, and the hash uses the app's own argon2id settings.
 *
 * Runs with `--conditions=react-server` (see prisma.config.ts) so server-only
 * modules such as the password hasher can be imported.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_CATEGORIES } from "../src/features/categories/default-categories";
import { addDays, isoDateToDb, startOfMonth, todayInTimeZone } from "../src/lib/dates";
import { parseMoney, type CurrencyCode } from "../src/lib/money";
import { hashPassword } from "../src/server/auth/password";

const DEMO_EMAIL = "demo@example.test";
const TIMEZONE = "Asia/Phnom_Penh";

function assertSafeTarget(url: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production.");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/(_dev|_development|_local)$/.test(dbName)) {
    throw new Error(
      `Refusing to seed "${dbName}": database name must end in _dev, _development or _local.`,
    );
  }
}

function demoPassword(): { password: string; generated: boolean } {
  const fromEnv = process.env.SEED_DEMO_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < 10) throw new Error("SEED_DEMO_PASSWORD must be at least 10 characters.");
    return { password: fromEnv, generated: false };
  }
  return { password: randomBytes(12).toString("base64url"), generated: true };
}

function money(input: string, currency: CurrencyCode): bigint {
  const result = parseMoney(input, currency, { allowNegative: true, allowZero: true });
  if (!result.ok) throw new Error(`Bad seed amount "${input}": ${result.error}`);
  return result.minor;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  assertSafeTarget(url);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const { password, generated } = demoPassword();
  const passwordHash = await hashPassword(password);
  const today = todayInTimeZone(TIMEZONE);
  const day = (offset: number) => isoDateToDb(addDays(today, offset));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.deleteMany({ where: { email: DEMO_EMAIL } });

      const user = await tx.user.create({
        data: {
          email: DEMO_EMAIL,
          name: "Demo User",
          passwordHash,
          timezone: TIMEZONE,
        },
      });
      const userId = user.id;

      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
      });
      const categories = await tx.category.findMany({ where: { userId } });
      const category = (name: string) => {
        const found = categories.find((c) => c.name === name);
        if (!found) throw new Error(`Seed category missing: ${name}`);
        return found;
      };

      const cash = await tx.financialAccount.create({
        data: {
          userId,
          name: "Cash wallet",
          type: "CASH",
          currency: "USD",
          openingBalanceMinor: money("85.00", "USD"),
        },
      });
      const bank = await tx.financialAccount.create({
        data: {
          userId,
          name: "ABA Savings",
          type: "BANK",
          currency: "USD",
          openingBalanceMinor: money("1,250.00", "USD"),
        },
      });
      const wallet = await tx.financialAccount.create({
        data: {
          userId,
          name: "Riel cash",
          type: "CASH",
          currency: "KHR",
          openingBalanceMinor: money("120,000", "KHR"),
        },
      });

      const entries: {
        account: { id: string };
        cat: string;
        type: "INCOME" | "EXPENSE";
        amount: bigint;
        offset: number;
        description: string;
      }[] = [
        {
          account: bank,
          cat: "Salary",
          type: "INCOME",
          amount: money("1,100.00", "USD"),
          offset: -14,
          description: "Monthly salary",
        },
        {
          account: bank,
          cat: "Housing and rent",
          type: "EXPENSE",
          amount: money("320.00", "USD"),
          offset: -13,
          description: "Rent",
        },
        {
          account: bank,
          cat: "Utilities",
          type: "EXPENSE",
          amount: money("15.00", "USD"),
          offset: -10,
          description: "Internet",
        },
        {
          account: cash,
          cat: "Food and drinks",
          type: "EXPENSE",
          amount: money("4.50", "USD"),
          offset: -3,
          description: "Lunch",
        },
        {
          account: cash,
          cat: "Transportation",
          type: "EXPENSE",
          amount: money("2.25", "USD"),
          offset: -2,
          description: "Tuk-tuk",
        },
        {
          account: wallet,
          cat: "Food and drinks",
          type: "EXPENSE",
          amount: money("8,000", "KHR"),
          offset: -1,
          description: "Market",
        },
        {
          account: wallet,
          cat: "Other income",
          type: "INCOME",
          amount: money("40,000", "KHR"),
          offset: 0,
          description: "Birthday gift",
        },
      ];
      await tx.transaction.createMany({
        data: entries.map((e) => ({
          userId,
          accountId: e.account.id,
          categoryId: category(e.cat).id,
          type: e.type,
          amountMinor: e.amount,
          occurredOn: day(e.offset),
          description: e.description,
        })),
      });

      // ATM withdrawal: a transfer, never income or expense.
      await tx.transfer.create({
        data: {
          userId,
          fromAccountId: bank.id,
          toAccountId: cash.id,
          fromAmountMinor: money("50.00", "USD"),
          toAmountMinor: money("50.00", "USD"),
          occurredOn: day(-5),
          description: "ATM withdrawal",
        },
      });

      await tx.budget.create({
        data: {
          userId,
          categoryId: category("Food and drinks").id,
          month: isoDateToDb(startOfMonth(today)),
          currency: "USD",
          amountMinor: money("150.00", "USD"),
        },
      });

      const goal = await tx.savingsGoal.create({
        data: {
          userId,
          name: "Emergency fund",
          currency: "USD",
          targetAmountMinor: money("1,000.00", "USD"),
          accountId: bank.id,
        },
      });
      await tx.savingsContribution.create({
        data: {
          userId,
          goalId: goal.id,
          amountMinor: money("200.00", "USD"),
          occurredOn: day(-14),
        },
      });
    });

    console.log(`Seeded demo data for ${DEMO_EMAIL}.`);
    console.log(
      generated
        ? `Generated password (shown once): ${password}\nSet SEED_DEMO_PASSWORD in .env to choose your own.`
        : "Password: the value of SEED_DEMO_PASSWORD.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
