import "server-only";

import { prisma } from "@/server/db";

/**
 * Read-only activity queries. Creating and editing transactions arrives in
 * phase 4; these exist now so account pages can show real history.
 */

export function listAccountTransactions(userId: string, accountId: string, take: number) {
  return prisma.transaction.findMany({
    where: { userId, accountId },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      type: true,
      amountMinor: true,
      occurredOn: true,
      description: true,
      createdAt: true,
      category: { select: { name: true, isArchived: true } },
    },
  });
}

export function listAccountTransfers(userId: string, accountId: string, take: number) {
  return prisma.transfer.findMany({
    where: { userId, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      fromAccountId: true,
      fromAmountMinor: true,
      toAmountMinor: true,
      occurredOn: true,
      description: true,
      createdAt: true,
      fromAccount: { select: { name: true, currency: true } },
      toAccount: { select: { name: true, currency: true } },
    },
  });
}
