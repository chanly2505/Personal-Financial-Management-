import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_ITEMS, getNavItem, isActivePath } from "@/components/layout/navigation";

describe("navigation config", () => {
  it("has unique routes", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("puts at most four items in the phone bottom bar", () => {
    expect(NAV_ITEMS.filter((i) => i.primaryOnMobile).length).toBeLessThanOrEqual(4);
  });

  it("has a page for every navigation item", () => {
    for (const { href } of NAV_ITEMS) {
      const page = path.resolve(import.meta.dirname, "../../src/app/(app)", `.${href}`, "page.tsx");
      expect(existsSync(page), `missing ${page}`).toBe(true);
    }
  });

  it("looks up items and rejects unknown routes", () => {
    expect(getNavItem("/accounts").label).toBe("Accounts");
    expect(() => getNavItem("/nope")).toThrow();
  });
});

describe("isActivePath", () => {
  it("matches the page and its sub-pages only", () => {
    expect(isActivePath("/accounts", "/accounts")).toBe(true);
    expect(isActivePath("/accounts/123", "/accounts")).toBe(true);
    expect(isActivePath("/accounts-archive", "/accounts")).toBe(false);
    expect(isActivePath("/dashboard", "/accounts")).toBe(false);
  });
});
