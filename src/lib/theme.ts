/**
 * Colour theme preference (Settings → Appearance). Kept per browser in a
 * cookie, not in the account, so it also applies on the sign-in pages and
 * each device can differ. "system" follows the device's light/dark setting.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseTheme(value: string | undefined): ThemePreference {
  return THEMES.includes(value as ThemePreference) ? (value as ThemePreference) : "system";
}

/**
 * Runs in <head> before the first paint and owns the `dark` class for every
 * choice: "dark" always, "system" when the device prefers dark (and follows
 * later changes). The server renders only `data-theme`, never the class, so a
 * re-render (e.g. after saving the choice) cannot overwrite it.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var t=d.dataset.theme;d.classList.toggle("dark",t==="dark"||(t==="system"&&m.matches))}a();m.addEventListener("change",a)})()`;

/** Apply a theme in the open page right away (the cookie covers later visits). */
export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}
