import "server-only";

import { prisma } from "@/server/db";

import type { ProfileValues } from "../schemas";

/** Profile data access. Always keyed by the session user's id. */
export function findProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      baseCurrency: true,
      timezone: true,
      exchangeRateKhrPerUsd: true,
      passwordChangedAt: true,
      createdAt: true,
    },
  });
}

export function updateProfile(userId: string, values: ProfileValues) {
  return prisma.user.update({
    where: { id: userId },
    // Explicit field list: never spread input into `data` (no mass assignment).
    data: {
      name: values.name || null,
      baseCurrency: values.baseCurrency,
      timezone: values.timezone,
      exchangeRateKhrPerUsd: values.exchangeRateKhrPerUsd,
    },
    select: { id: true },
  });
}
