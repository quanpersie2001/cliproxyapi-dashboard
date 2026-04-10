"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const VALID_THEMES: Theme[] = ["light", "dark", "system"];

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
});

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem("theme");
    return stored && VALID_THEMES.includes(stored as Theme) ? (stored as Theme) : null;
  } catch {
    return null;
  }
}

function getInitialResolvedTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? "system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(getInitialResolvedTheme);
  const shouldDisableTransitionsRef = useRef(false);

  const applyResolvedTheme = useCallback((resolved: "light" | "dark") => {
    const root = document.documentElement;

    if (shouldDisableTransitionsRef.current) {
      root.classList.add("theme-switching");
    }

    setResolvedTheme((current) => (current === resolved ? current : resolved));
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;

    if (shouldDisableTransitionsRef.current) {
      shouldDisableTransitionsRef.current = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove("theme-switching");
        });
      });
    }
  }, []);

  useEffect(() => {
    applyResolvedTheme(theme === "system" ? getSystemTheme() : theme);
  }, [applyResolvedTheme, theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      applyResolvedTheme(event.matches ? "dark" : "light");
    };

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyResolvedTheme, theme]);

  const setTheme = (newTheme: Theme) => {
    shouldDisableTransitionsRef.current = true;
    setThemeState(newTheme);

    try {
      localStorage.setItem("theme", newTheme);
    } catch {
      // Ignore storage write failures.
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
