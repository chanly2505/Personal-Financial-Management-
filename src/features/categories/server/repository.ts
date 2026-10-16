import "server-only";

import { prisma } from "@/server/db";

import type { CategoryColor, CategoryType } from "../schemas";

/** Category data access, always scoped by the session user's id. */

const categorySelect = {
  id: true,
  name: true,
  type: true,
  color: true,
  isArchived: true,
  archivedAt: true,
  createdAt: true,
  _count: { select: { transactions: true, recurringRules: true, budgets: true } },
} as const;

export function listCategories(userId: string) {
  return prisma.category.findMany({
    where: { userId },
    select: categorySelect,
    orderBy: [{ type: "asc" }, { isArchived: "asc" }, { name: "asc" }],
  });
}

export function findCategory(userId: string, id: string) {
  return prisma.category.findFirst({ where: { id, userId }, select: categorySelect });
}

export function findCategoryByName(
  userId: string,
  type: CategoryType,
  name: string,
  excludeId?: string,
) {
  return prisma.category.findFirst({
    where: {
      userId,
      type,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, isArchived: true },
  });
}

export function listActiveByType(userId: string, type: CategoryType) {
  return prisma.category.findMany({
    where: { userId, type, isArchived: false },
    select: { id: true, name: true, color: true, type: true },
    orderBy: { name: "asc" },
  });
}

export function createCategory(
  userId: string,
  data: { name: string; type: CategoryType; color: CategoryColor },
) {
  return prisma.category.create({
    data: { userId, name: data.name, type: data.type, color: data.color },
    select: { id: true },
  });
}

export async function updateCategory(
  userId: string,
  id: string,
  data: { name: string; type: CategoryType; color: CategoryColor },
): Promise<number> {
  const { count } = await prisma.category.updateMany({
    where: { id, userId },
    data: { name: data.name, type: data.type, color: data.color },
  });
  return count;
}

export async function setArchived(userId: string, id: string, archived: boolean): Promise<number> {
  const { count } = await prisma.category.updateMany({
    where: { id, userId },
    data: { isArchived: archived, archivedAt: archived ? new Date() : null },
  });
  return count;
}

export async function deleteCategory(userId: string, id: string): Promise<number> {
  const { count } = await prisma.category.deleteMany({ where: { id, userId } });
  return count;
}
