import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/server/auth/session";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * CSV export through the real route handler. Only the session lookup is a test
 * double; filters, SQL, streaming and encoding are real.
 */
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/session")>();
  return { ...original, getCurrentUser: async () => session.current };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { GET } = await import("@/app/api/transactions/export/route");
const { createAccount } = await import("@/features/accounts/server/service");
const { createEntry, createTransfer, reverseTransfer } =
  await import("@/features/transactions/server/service");
const { prepareLedgerExport, EXPORT_COLUMNS } =
  await import("@/features/transactions/server/export");
const { ledgerFiltersSchema } = await import("@/features/transactions/schemas");
const { isoDateToDb } = await import("@/lib/dates");

const TZ = "Asia/Phnom_Penh";
const HEADER = EXPORT_COLUMNS.join(",");

async function newUser() {
  const registered = await registerTestUser();
  const user: CurrentUser = {
    id: registered.id,
    email: registered.email,
    name: null,
    timezone: TZ,
    baseCurrency: "USD",
  };
  const category = async (name: string) =>
    (await prisma.category.findFirstOrThrow({ where: { userId: user.id, name } })).id;
  return {
    user,
    food: await category("Food and drinks"),
    salary: await category("Salary"),
  };
}

async function exportCsv(query = "") {
  const response = await GET(new Request(`http://localhost/api/transactions/export${query}`), {});
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { response, buffer, text: new TextDecoder().decode(buffer) };
}

/** Split CSV text into records (RFC 4180, enough for these tests). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += ch;
  }
  return rows;
}

beforeEach(async () => {
  await resetDatabase();
  session.current = null;
});

describe("access", () => {
  it("requires a session", async () => {
    const { response } = await exportCsv();
    expect(response.status).toBe(401);
  });

  it("exports only the signed-in user's records, even when given another user's account id", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const aliceBank = (
      await createAccount(alice.user, {
        name: "Alice bank",
        type: "BANK",
        currency: "USD",
        openingBalance: "0",
      })
    ).id;
    const bobBank = (
      await createAccount(bob.user, {
        name: "Bob bank",
        type: "BANK",
        currency: "USD",
        openingBalance: "0",
      })
    ).id;
    for (const [owner, account, payee] of [
      [alice, aliceBank, "Alice secret"],
      [bob, bobBank, "Bob coffee"],
    ] as const) {
      await createEntry(owner.user, {
        type: "EXPENSE",
        accountId: account,
        categoryId: owner.food,
        amount: "1",
        occurredOn: "2026-03-01",
        payee,
        clientRequestId: randomUUID(),
      });
    }
    session.current = bob.user;
    const all = parseCsv((await exportCsv()).text);
    expect(all).toHaveLength(2);
    expect(all[1]![7]).toBe("Bob coffee");
    const probing = await exportCsv(`?accountId=${aliceBank}`);
    expect(probing.response.status).toBe(200);
    expect(parseCsv(probing.text)).toHaveLength(1); // header only
    expect(probing.text).not.toContain("Alice");
    // No user ids, emails or auth data in the file.
    expect(all.flat().join(" ")).not.toContain(bob.user.id);
    expect(all.flat().join(" ")).not.toContain(bob.user.email);
  });
});

describe("format", () => {
  it("writes a BOM, headers, ISO dates, currency, type and fixed decimals", async () => {
    const { user, food, salary } = await newUser();
    session.current = user;
    const bank = (
      await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "0" })
    ).id;
    const wing = (
      await createAccount(user, {
        name: "Wing",
        type: "BANK",
        currency: "USD",
        openingBalance: "0",
      })
    ).id;
    const cash = (
      await createAccount(user, {
        name: "Cash",
        type: "CASH",
        currency: "KHR",
        openingBalance: "0",
      })
    ).id;
    const add = (type: "INCOME" | "EXPENSE", accountId: string, amount: string, date: string) =>
      createEntry(user, {
        type,
        accountId,
        categoryId: type === "INCOME" ? salary : food,
        amount,
        occurredOn: date,
        clientRequestId: randomUUID(),
      });
    await add("INCOME", bank, "1234.5", "2026-03-01");
    await add("EXPENSE", cash, "40,000", "2026-03-02");
    await add("EXPENSE", bank, "0.05", "2026-03-03");
    const { id: transfer } = await createTransfer(user, {
      fromAccountId: bank,
      toAccountId: wing,
      amount: "10",
      occurredOn: "2026-03-04",
      clientRequestId: randomUUID(),
    });
    const { id: reversal } = await reverseTransfer(user, {
      id: transfer,
      clientRequestId: randomUUID(),
    });

    const { response, buffer, text } = await exportCsv("?sort=date_asc");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="transactions-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-export-rows")).toBe("5");
    expect([...buffer.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const rows = parseCsv(text.replace(/^﻿/, ""));
    expect(rows[0]!.join(",")).toBe(HEADER);
    expect(rows.slice(1).map((r) => r.slice(0, 7))).toEqual([
      ["2026-03-01", "Income", "1234.50", "USD", "ABA", "", "Salary"],
      ["2026-03-02", "Expense", "40000", "KHR", "Cash", "", "Food and drinks"],
      ["2026-03-03", "Expense", "0.05", "USD", "ABA", "", "Food and drinks"],
      ["2026-03-04", "Transfer", "10.00", "USD", "ABA", "Wing", ""],
      [expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "Transfer", "10.00", "USD", "Wing", "ABA", ""],
    ]);
    expect(rows[4]![9]).toBe(`Reversed by ${reversal}`);
    expect(rows[5]![9]).toBe(`Reverses ${transfer}`);
    expect(rows[4]![10]).toBe(transfer);
  });

  it("escapes commas, quotes and newlines and neutralises formulas in untrusted text", async () => {
    const { user, food } = await newUser();
    session.current = user;
    const bank = (
      await createAccount(user, {
        name: '=Bank, "main"',
        type: "BANK",
        currency: "USD",
        openingBalance: "0",
      })
    ).id;
    await createEntry(user, {
      type: "EXPENSE",
      accountId: bank,
      categoryId: food,
      amount: "1",
      occurredOn: "2026-03-01",
      payee: '@SUM(1+1)*cmd|" /C calc"!A0',
      note: 'line one\nline "two", end\r\n-3 dollars',
      clientRequestId: randomUUID(),
    });
    const { text } = await exportCsv();
    const rows = parseCsv(text.replace(/^﻿/, ""));
    expect(rows).toHaveLength(2);
    const row = rows[1]!;
    expect(row).toHaveLength(EXPORT_COLUMNS.length);
    expect(row[4]).toBe('\'=Bank, "main"');
    expect(row[7]).toBe(`'@SUM(1+1)*cmd|" /C calc"!A0`);
    expect(row[8]).toBe('line one\nline "two", end\r\n-3 dollars');
    expect(text).toContain('"line one\nline ""two"", end\r\n-3 dollars"');
  });
});

describe("filters", () => {
  it("respects type, account, category, currency, dates, search and amounts", async () => {
    const { user, food, salary } = await newUser();
    session.current = user;
    const bank = (
      await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "0" })
    ).id;
    const cash = (
      await createAccount(user, {
        name: "Cash",
        type: "CASH",
        currency: "KHR",
        openingBalance: "0",
      })
    ).id;
    const add = (
      type: "INCOME" | "EXPENSE",
      accountId: string,
      amount: string,
      date: string,
      payee: string,
    ) =>
      createEntry(user, {
        type,
        accountId,
        categoryId: type === "INCOME" ? salary : food,
        amount,
        occurredOn: date,
        payee,
        clientRequestId: randomUUID(),
      });
    await add("INCOME", bank, "100", "2026-02-28", "feb");
    await add("EXPENSE", bank, "5", "2026-03-01", "coffee");
    await add("EXPENSE", bank, "50", "2026-03-31", "dinner");
    await add("EXPENSE", cash, "8000", "2026-03-15", "noodles");
    await add("INCOME", bank, "200", "2026-04-01", "apr");

    const payees = async (query: string) =>
      parseCsv((await exportCsv(query)).text.replace(/^﻿/, ""))
        .slice(1)
        .map((r) => r[7])
        .sort();
    expect(await payees("?from=2026-03-01&to=2026-03-31")).toEqual(["coffee", "dinner", "noodles"]);
    expect(await payees("?kind=INCOME")).toEqual(["apr", "feb"]);
    expect(await payees(`?accountId=${cash}`)).toEqual(["noodles"]);
    expect(await payees("?currency=USD&kind=EXPENSE")).toEqual(["coffee", "dinner"]);
    expect(await payees(`?categoryId=${salary}`)).toEqual(["apr", "feb"]);
    expect(await payees("?q=din")).toEqual(["dinner"]);
    expect(await payees("?min=10&max=60")).toEqual(["dinner"]);
    // Invalid values are ignored, like on the Transactions page.
    expect(await payees("?currency=EUR&kind=nope")).toHaveLength(5);
  });
});

describe("large exports", () => {
  it("streams every row exactly once across batches, in date order", async () => {
    const { user, food } = await newUser();
    const bank = (
      await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "0" })
    ).id;
    // 7 records, 3 on the same date (the keyset must break ties without skipping).
    const dates = [
      "2026-03-01",
      "2026-03-02",
      "2026-03-02",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ];
    for (const [i, date] of dates.entries()) {
      await createEntry(user, {
        type: "EXPENSE",
        accountId: bank,
        categoryId: food,
        amount: String(i + 1),
        occurredOn: date,
        payee: `p${i}`,
        clientRequestId: randomUUID(),
      });
    }
    const filters = ledgerFiltersSchema.parse({ sort: "date_desc" });
    const { stream, rowCount } = await prepareLedgerExport(user, filters, {
      maxRows: 10,
      batchSize: 2,
    });
    expect(rowCount).toBe(7);
    const rows = parseCsv((await new Response(stream).text()).replace(/^﻿/, "")).slice(1);
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r[10])).size).toBe(7);
    expect(rows.map((r) => r[0])).toEqual([...dates].reverse());
  });

  it("refuses an export over the row limit with a clear message", async () => {
    const { user, food } = await newUser();
    const bank = (
      await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "0" })
    ).id;
    for (let i = 0; i < 3; i++) {
      await createEntry(user, {
        type: "EXPENSE",
        accountId: bank,
        categoryId: food,
        amount: "1",
        occurredOn: "2026-03-01",
        clientRequestId: randomUUID(),
      });
    }
    await expect(
      prepareLedgerExport(user, ledgerFiltersSchema.parse({}), { maxRows: 2, batchSize: 1 }),
    ).rejects.toThrow(/3 rows; the limit is 2/);
  });

  it("exports thousands of rows through the route", async () => {
    const { user, food } = await newUser();
    session.current = user;
    const bank = (
      await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "0" })
    ).id;
    const count = 3_500;
    await prisma.transaction.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        userId: user.id,
        accountId: bank,
        categoryId: food,
        type: "EXPENSE" as const,
        amountMinor: BigInt(i + 1),
        occurredOn: isoDateToDb(`2026-0${(i % 9) + 1}-15` as never),
      })),
    });
    const { response, text } = await exportCsv();
    expect(response.headers.get("x-export-rows")).toBe(String(count));
    const rows = parseCsv(text.replace(/^﻿/, "")).slice(1);
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map((r) => r[10])).size).toBe(count);
    // Σ 1..3500 cents = 6,126,750 cents.
    const total = rows.reduce((s, r) => s + BigInt(r[2]!.replace(".", "")), 0n);
    expect(total).toBe(6_126_750n);
  });
});
