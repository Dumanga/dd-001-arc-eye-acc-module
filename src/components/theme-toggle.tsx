"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group flex h-10 items-center gap-2 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
      aria-label="Toggle theme"
    >
      <span className="text-[11px] uppercase tracking-[0.25em]">
        {isDark ? "Dark" : "Light"}
      </span>
      <span className="relative flex h-5 w-10 items-center rounded-full border border-[var(--stroke)] bg-[var(--panel)]">
        <span
          className={`absolute left-0.5 h-4 w-4 rounded-full bg-[var(--accent)] transition ${
            isDark ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
