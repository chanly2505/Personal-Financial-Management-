import { expect, test as base } from "@playwright/test";

import { PASSWORD, formAlert, newUser, register, signIn, signOut, test } from "./fixtures";

const PROTECTED = [
  "/dashboard",
  "/transactions",
  "/accounts",
  "/budgets",
  "/categories",
  "/recurring",
  "/goals",
  "/reports",
  "/settings",
];

base.describe("unauthenticated access", () => {
  for (const path of PROTECTED) {
    base(`${path} redirects to sign-in and remembers where to return`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(`/sign-in?callbackUrl=${encodeURIComponent(path)}`);
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    });
  }

  base("API returns a 401 JSON error without a session", async ({ request }) => {
    const response = await request.get("/api/me");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Please sign in to continue." },
    });
  });

  base(
    "a forged or expired session cookie is treated as signed out",
    async ({ page, context, baseURL }) => {
      await context.addCookies([
        { name: "authjs.session-token", value: "not-a-valid-token", url: baseURL ?? "" },
      ]);
      await page.goto("/settings");
      await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fsettings$/);
      await expect(page.getByLabel("Email")).toBeVisible();
      const api = await page.request.get("/api/me");
      expect(api.status()).toBe(401);
    },
  );

  base("password recovery is hidden when no email transport is configured", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveCount(0);
    const response = await page.goto("/forgot-password");
    expect(response?.status()).toBe(404);
  });
});

base.describe("registration and sign-in", () => {
  base("registers, signs out, and signs back in to the requested page", async ({ page }) => {
    const user = await register(page);
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByText(user.email)).toBeVisible();
    await page.keyboard.press("Escape");

    await signOut(page);
    await page.goto("/accounts");
    await expect(page).toHaveURL(/callbackUrl=%2Faccounts/);
    await signIn(page, user);
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accounts");
  });

  base("validates the registration form on the client and server", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("different");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    await expect(page.getByText("Passwords don't match.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/register$/);
  });

  base("does not reveal whether an email is registered", async ({ page, browser }) => {
    const user = await register(page);

    // Registering the same email again: generic message.
    const other = await browser.newPage();
    await other.goto("/register");
    await other.getByLabel("Email").fill(user.email);
    await other.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await other.getByLabel("Confirm password").fill(PASSWORD);
    await other.getByRole("button", { name: "Create account" }).click();
    await expect(other.getByText(/couldn't create an account with these details/)).toBeVisible();

    // Wrong password and unknown email produce the identical message.
    for (const email of [user.email, newUser("unknown").email]) {
      await other.goto("/sign-in");
      await signIn(other, { email, password: "wrong password!!" });
      await expect(formAlert(other)).toHaveText("Email or password is incorrect.");
      await expect(other).toHaveURL(/\/sign-in/);
    }
    await other.close();
  });

  base("locks sign-in for an email after repeated failures", async ({ page }) => {
    const user = await register(page);
    await signOut(page);
    for (let i = 0; i < 5; i++) {
      await signIn(page, { email: user.email, password: `wrong password ${i}` });
      await expect(formAlert(page)).toHaveText("Email or password is incorrect.");
    }
    await signIn(page, user);
    await expect(formAlert(page)).toHaveText(/Too many attempts/);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  base("ignores off-site callback URLs (no open redirect)", async ({ page }) => {
    const user = await register(page);
    await signOut(page);
    await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("https://evil.example/")}`);
    await signIn(page, user);
    await expect(page).toHaveURL(/localhost:\d+\/dashboard$/);
  });

  test("signed-in users skip the sign-in, register and landing pages", async ({ page, user }) => {
    expect(user.email).toContain("@e2e.test");
    for (const path of ["/sign-in", "/register", "/"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  });
});

test.describe("session invalidation", () => {
  test("signing out ends the session on the server; other devices stay signed in", async ({
    page,
    user,
    browser,
  }) => {
    const otherDevice = await browser.newContext();
    const other = await otherDevice.newPage();
    await other.goto("/sign-in");
    await signIn(other, user);
    await expect(other).toHaveURL(/\/dashboard$/);

    // Someone copies this browser's cookie, then the user signs out here.
    await page.goto("/dashboard");
    const copied = await page.context().cookies();
    await signOut(page);
    await expect(page).toHaveURL(/\/sign-in/);

    const thief = await browser.newContext();
    await thief.addCookies(copied);
    const stolen = await thief.newPage();
    await stolen.goto("/dashboard");
    await expect(stolen).toHaveURL(/\/sign-in/);
    expect((await stolen.request.get("/api/me")).status()).toBe(401);
    // The Auth.js session endpoint reveals nothing for the revoked cookie (SEC-3).
    const session = await stolen.request.get("/api/auth/session");
    expect(await session.json()).toBeNull();
    expect(session.headers()["set-cookie"]).toBeUndefined();
    await thief.close();

    // Signing out on one device does not sign out the others.
    await other.goto("/transactions");
    await expect(other).toHaveURL(/\/transactions$/);
    await otherDevice.close();
  });

  test("sign out everywhere ends sessions on other devices", async ({ page, user, browser }) => {
    const otherDevice = await browser.newContext();
    const other = await otherDevice.newPage();
    await other.goto("/sign-in");
    await signIn(other, user);
    await expect(other).toHaveURL(/\/dashboard$/);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Sign out everywhere" })
      .click();
    await expect(page).toHaveURL(/\/sign-in\?notice=signed-out-everywhere/);
    await expect(page.getByText("You've been signed out on all devices.")).toBeVisible();

    // The other device still holds its cookie, but the server no longer accepts it.
    await other.goto("/transactions");
    await expect(other).toHaveURL(/\/sign-in\?callbackUrl=%2Ftransactions/);
    expect((await other.request.get("/api/me")).status()).toBe(401);
    await otherDevice.close();
  });

  test("changing the password revokes every session and the old password", async ({
    page,
    user,
    browser,
  }) => {
    const otherDevice = await browser.newContext();
    const other = await otherDevice.newPage();
    await other.goto("/sign-in");
    await signIn(other, user);
    await expect(other).toHaveURL(/\/dashboard$/);

    await page.goto("/settings");
    await page.getByLabel("Current password").fill("not my password");
    await page.getByLabel("New password", { exact: true }).fill("brand new password 1");
    await page.getByLabel("Confirm new password").fill("brand new password 1");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Your current password is incorrect.").first()).toBeVisible();

    await page.getByLabel("Current password").fill(user.password);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page).toHaveURL(/notice=password-changed/);

    await other.goto("/dashboard");
    await expect(other).toHaveURL(/\/sign-in/);

    await signIn(page, user);
    await expect(formAlert(page)).toHaveText("Email or password is incorrect.");
    await signIn(page, { email: user.email, password: "brand new password 1" });
    await expect(page).toHaveURL(/\/dashboard$/);
    await otherDevice.close();
  });
});

base.describe("user data isolation", () => {
  base("each user sees and changes only their own profile", async ({ browser }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();
    const alice = await register(alicePage, newUser("alice"));
    const bob = await register(bobPage, newUser("bob"));

    await alicePage.goto("/settings");
    await alicePage.getByLabel("Name").fill("Alice Renamed");
    await alicePage.getByRole("button", { name: "Save profile" }).click();
    await expect(alicePage.getByText("Profile saved")).toBeVisible();

    await bobPage.goto("/settings");
    await expect(bobPage.getByLabel("Email")).toHaveValue(bob.email);
    await expect(bobPage.getByLabel("Name")).toHaveValue(bob.name);

    const me = await bobPage.request.get(`/api/me?userId=${encodeURIComponent(alice.email)}`);
    expect(await me.json()).toMatchObject({ email: bob.email, name: bob.name });

    await aliceContext.close();
    await bobContext.close();
  });

  test("deleting an account removes it and signs out", async ({ page, user }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete account…" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await dialog.getByLabel("Your password").fill(user.password);
    await dialog.getByLabel("Type DELETE to confirm").fill("delete");
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(dialog.getByText("Type DELETE to confirm.")).toBeVisible();

    await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/notice=account-deleted/);

    await signIn(page, user);
    await expect(formAlert(page)).toHaveText("Email or password is incorrect.");
  });
});

base.describe("security headers", () => {
  base(
    "pages send a nonce-based CSP and hardening headers, with no violations",
    async ({ page }) => {
      const violations: string[] = [];
      page.on("console", (msg) => {
        if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
      });
      const response = await page.goto("/sign-in");
      const headers = response?.headers() ?? {};
      expect(headers["content-security-policy"]).toMatch(
        /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
      );
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["x-powered-by"]).toBeUndefined();

      // The page is interactive (scripts allowed by the nonce): client validation runs.
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Enter your email address.")).toBeVisible();
      expect(violations).toEqual([]);
    },
  );

  base("session cookie is HttpOnly and SameSite=Lax", async ({ page, context }) => {
    await register(page);
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("authjs.session-token"));
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });
});
