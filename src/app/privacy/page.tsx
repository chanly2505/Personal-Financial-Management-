import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

/**
 * Plain-language privacy notice. Every statement here describes what the code
 * does (docs/SECURITY.md §9–10); change it together with the behaviour.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:px-6">
      <header>
        <Link
          href="/"
          className="mb-8 flex items-center gap-2 self-start rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <BrandMark />
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
      </header>
      <main className="flex flex-col gap-6 text-sm leading-6 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Privacy notice</h1>
          <p className="text-muted-foreground">
            What {APP_NAME} stores about you, why, and how you stay in control.
          </p>
        </div>

        <section aria-labelledby="what" className="flex flex-col gap-2">
          <h2 id="what">What is stored</h2>
          <ul>
            <li>
              <strong>Your account:</strong> email address, name (optional), time zone and display
              preferences. Your password is stored only as a one-way hash (Argon2id) — nobody can
              read it, including the people who run the site.
            </li>
            <li>
              <strong>What you enter:</strong> accounts, transactions, transfers, categories,
              budgets, recurring items and savings goals, including any notes and payee names.
            </li>
            <li>
              <strong>Budget warnings</strong> created from your budgets, shown only inside the app.
            </li>
            <li>
              <strong>Abuse protection:</strong> to limit repeated sign-in and sign-up attempts, a
              keyed one-way hash of your email or network address is kept for a short time and
              deleted automatically, normally within two days.
            </li>
          </ul>
        </section>

        <section aria-labelledby="cookies" className="flex flex-col gap-2">
          <h2 id="cookies">Cookies</h2>
          <ul>
            <li>
              <strong>Sign-in cookie</strong> — keeps you signed in for up to 7 days. Required.
              Signing out ends the session on the server, too.
            </li>
            <li>
              <strong>Security cookies</strong> — short-lived, used only while signing in.
            </li>
            <li>
              <strong>Theme cookie</strong> — remembers light or dark colours on this browser.
            </li>
          </ul>
          <p>There are no advertising, tracking or analytics cookies.</p>
        </section>

        <section aria-labelledby="use" className="flex flex-col gap-2">
          <h2 id="use">How it is used</h2>
          <p>
            Only to show you your own finances. Your data is not sold, shared with advertisers, used
            for profiling, or shown to other users. There are no analytics, trackers or ads, and no
            e-mails or phone notifications are sent.
          </p>
          <p>
            The app&apos;s own logs record events such as &quot;signed in&quot; or &quot;page
            failed&quot; with internal ids — never amounts, descriptions, names, email addresses,
            passwords or cookies. Like any website, the hosting provider also keeps short-lived
            access logs of the addresses visited (which can include search terms and filters you
            type) and network addresses.
          </p>
        </section>

        <section aria-labelledby="where" className="flex flex-col gap-2">
          <h2 id="where">Where it is kept</h2>
          <p>
            In a PostgreSQL database run by the site&apos;s hosting providers: Railway runs the
            website and Neon the database, both in the eastern United States. Connections are
            encrypted. The people who run the site keep private backup copies to recover from
            accidents, for up to 12 months.
          </p>
        </section>

        <section aria-labelledby="control" className="flex flex-col gap-2">
          <h2 id="control">Your choices</h2>
          <ul>
            <li>
              <strong>Download</strong> everything at any time: Settings → Your data (CSV or a full
              JSON copy).
            </li>
            <li>
              <strong>Correct</strong> any record or your profile directly in the app.
            </li>
            <li>
              <strong>Delete</strong> your account in Settings → Delete account. Your account and
              every record in it are removed immediately; backup copies made before that are deleted
              as they expire, within 12 months.
            </li>
          </ul>
          <p>
            Questions? Contact the person or organisation that runs this site and gave you access.
          </p>
        </section>

        <p className="text-muted-foreground">
          <Link href="/sign-in" className="underline underline-offset-4 hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
