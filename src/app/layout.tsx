import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";

import { FirebaseInit } from "@/components/providers/firebase-init";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";
import { THEME_COOKIE, THEME_SCRIPT, parseTheme } from "@/lib/theme";

import "./globals.css";
import { DEFAULT_LOCALE } from "@/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

const THEME_COLOR = { light: "#fafbfc", dark: "#14161c" };

/** Browser bar colour: the chosen theme, or the device's setting with "system". */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  if (theme !== "system") return { themeColor: THEME_COLOR[theme] };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
      { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
    ],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request: the CSP nonce set by src/proxy.ts is unique
  // per response, and statically prerendered HTML could not carry it.
  await connection();
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html
      lang={DEFAULT_LOCALE}
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // THEME_SCRIPT adds the "dark" class before React hydrates (src/lib/theme.ts).
      suppressHydrationWarning
    >
      <head>
        <script nonce={headerList.get("x-nonce") ?? undefined}>{THEME_SCRIPT}</script>
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
        <FirebaseInit />
      </body>
    </html>
  );
}
