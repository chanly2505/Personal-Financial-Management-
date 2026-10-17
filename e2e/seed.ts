import "dotenv/config";
import { Client } from "pg";

/**
 * Inserts a small, realistic data set for a registered e2e user directly into
 * the database (fast, and independent of the UI under test). Returns the ids
 * needed to open detail pages.
 */
export async function seedEverything(email: string) {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    const one = async <T>(sql: string, params: unknown[]) =>
      (await client.query(sql, params)).rows[0] as T;
    const { id: userId } = await one<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    const category = async (name: string) =>
      (
        await one<{ id: string }>("SELECT id FROM categories WHERE user_id = $1 AND name = $2", [
          userId,
          name,
        ])
      ).id;
    const account = async (name: string, currency: string, opening: number) =>
      (
        await one<{ id: string }>(
          `INSERT INTO accounts (id, user_id, name, type, currency, opening_balance_minor, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'BANK', $3, $4, now()) RETURNING id`,
          [userId, name, currency, opening],
        )
      ).id;
    const aba = await account("ABA", "USD", 10000);
    const wing = await account("Wing", "USD", 0);
    const cash = await account("Cash", "KHR", 50000);
    const food = await category("Food and drinks");
    const entry = async (
      type: string,
      acc: string,
      cat: string,
      amount: number,
      on: string,
      payee: string,
    ) =>
      (
        await one<{ id: string }>(
          `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount_minor, occurred_on, payee, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
          [userId, acc, cat, type, amount, on, payee],
        )
      ).id;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh" }).format(
      new Date(),
    );
    const transactionId = await entry(
      "INCOME",
      aba,
      await category("Salary"),
      200000,
      today,
      "Employer",
    );
    await entry("EXPENSE", aba, food, 1250, today, "Lucky Supermarket");
    await entry("EXPENSE", cash, await category("Transportation"), 20000, today, "PassApp");
    const { id: transferId } = await one<{ id: string }>(
      `INSERT INTO transfers (id, user_id, from_account_id, to_account_id, from_amount_minor, to_amount_minor, occurred_on, note, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 10000, 10000, $4, 'Top up', now()) RETURNING id`,
      [userId, aba, wing, today],
    );
    const { id: budgetId } = await one<{ id: string }>(
      `INSERT INTO budgets (id, user_id, category_id, category_type, month, currency, amount_minor, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'EXPENSE', date_trunc('month', $3::date)::date, 'USD', 1000, now()) RETURNING id`,
      [userId, food, today],
    );
    const { id: ruleId } = await one<{ id: string }>(
      `INSERT INTO recurring_rules (id, user_id, name, account_id, category_id, type, amount_minor, frequency, interval, start_on, next_occurrence_on, updated_at)
       VALUES (gen_random_uuid(), $1, 'Phone bill', $2, $3, 'EXPENSE', 500, 'MONTHLY', 1, $4::date + 20, $4::date + 20, now()) RETURNING id`,
      [userId, aba, await category("Utilities"), today],
    );
    const { id: goalId } = await one<{ id: string }>(
      `INSERT INTO savings_goals (id, user_id, name, currency, target_amount_minor, updated_at)
       VALUES (gen_random_uuid(), $1, 'Emergency fund', 'USD', 100000, now()) RETURNING id`,
      [userId],
    );
    return { userId, aba, wing, cash, transactionId, transferId, budgetId, ruleId, goalId };
  } finally {
    await client.end();
  }
}
