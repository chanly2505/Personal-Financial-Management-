import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, PiggyBank, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/session";

// Public landing page. Signed-in users go straight to their dashboard.
const highlights = [
  {
    icon: Wallet,
    title: "Every account in one place",
    description: "Cash, bank accounts and digital wallets in US dollars or Cambodian riel.",
  },
  {
    icon: ArrowLeftRight,
    title: "Income, expenses and transfers",
    description: "Moving money between your own accounts never counts as spending.",
  },
  {
    icon: PiggyBank,
    title: "Budgets and savings goals",
    description: "Set monthly limits and see how close you are to what you are saving for.",
  },
];

export default async function HomePage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-primary">Personal Finance</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Know where your money goes.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          A calm, private place to track your income, spending, budgets and savings in US dollars
          and riel.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/register">Create an account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {highlights.map(({ icon: Icon, title, description }) => (
          <li key={title}>
            <Card className="h-full gap-3">
              <CardHeader>
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <CardTitle className="mt-2 text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{description}</CardDescription>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
