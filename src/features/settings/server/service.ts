import "server-only";

import type { CurrencyCode } from "@/lib/money";
import { NotFoundError } from "@/server/errors";

import type { ProfileValues } from "../schemas";
import * as repo from "./repository";

export interface Profile {
  email: string;
  name: string | null;
  baseCurrency: CurrencyCode;
  timezone: string;
  /** Decimal string, e.g. "4100" or "4100.5". */
  exchangeRateKhrPerUsd: string;
  passwordChangedAt: Date;
  createdAt: Date;
}

export async function getProfile(userId: string): Promise<Profile> {
  const profile = await repo.findProfile(userId);
  if (!profile) throw new NotFoundError();
  return {
    ...profile,
    exchangeRateKhrPerUsd: profile.exchangeRateKhrPerUsd.toString(),
  };
}

export async function updateProfile(userId: string, values: ProfileValues): Promise<void> {
  await repo.updateProfile(userId, values);
}
