"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const label =
    theme === "system"
      ? "Theme: system"
      : theme === "dark"
        ? "Theme: dark"
        : "Theme: light";

  return (
    <button
      type="button"
      onClick={cycle}
      className="relative rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition-colors"
      aria-label={label}
      title={label}
    >
      {/* Sun icon (shown in light mode) */}
      <svg
        className="h-[18px] w-[18px] transition-transform duration-300"
        style={{ display: resolvedTheme === "light" ? "block" : "none" }}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>

      {/* Moon icon (shown in dark mode) */}
      <svg
        className="h-[18px] w-[18px] transition-transform duration-300"
        style={{ display: resolvedTheme === "dark" ? "block" : "none" }}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>

      {/* System indicator dot */}
      {theme === "system" && (
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500" />
      )}
    </button>
  );
}
