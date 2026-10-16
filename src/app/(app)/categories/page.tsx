import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryManager } from "@/features/categories/components/category-manager";
import { listCategories } from "@/features/categories/server/service";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requirePageUser();
  const categories = await listCategories(user);

  return (
    <PageContainer>
      <PageHeader
        title="Categories"
        description="Labels for your income and spending. A category is either income or expense, never both."
      />
      <CategoryManager
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          color: c.color,
          isArchived: c.isArchived,
          usageCount: c.usageCount,
          transactionCount: c.transactionCount,
        }))}
      />
    </PageContainer>
  );
}
