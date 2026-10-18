import { randomUUID } from "node:crypto";

import { type Locator, type Page, expect, test as base } from "@playwright/test";

export const PASSWORD = "e2e password 12345";

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

/** A unique user per call; the e2e global setup deletes *@e2e.test users. */
export function newUser(label = "user"): TestUser {
  const id = randomUUID().slice(0, 8);
  return { email: `${label}-${id}@e2e.test`, password: PASSWORD, name: `${label} ${id}` };
}

/** Register through the real UI and wait for the dashboard. */
export async function register(page: Page, user: TestUser = newUser()): Promise<TestUser> {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return user;
}

export async function signIn(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The form-level error alert (not Next.js's route announcer, which also has role="alert"). */
export function formAlert(page: Page) {
  return page.locator('[data-slot="alert"][role="alert"]');
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

/** `page` already signed in as a freshly registered user. */
/**
 * Open an actions menu and choose an item. Retries opening: under load a click
 * during the menu's open animation can be lost, leaving the item missing.
 */
export async function chooseMenuItem(page: Page, trigger: Locator, item: string) {
  const option = page.getByRole("menuitem", { name: item });
  await expect(async () => {
    if (!(await option.isVisible())) await trigger.click();
    await expect(option).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await option.click();
}

export const test = base.extend<{ user: TestUser }>({
  // (Playwright's fixture callback is conventionally named `use`; renamed so the
  // React hooks lint rule does not mistake it for React's use().)
  user: async ({ page }, provide) => {
    await provide(await register(page));
  },
});

export { expect };
