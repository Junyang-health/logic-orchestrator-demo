import { useEffect } from "react";
import { documentLocaleFromAppLocale } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";

/** Initializes theme from storage (default dark when unset) and syncs `document.documentElement` + localStorage. */
export default function ThemeDocumentSync() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const locale = useUiStore((s) => s.locale);

  useEffect(() => {
    const key = "mindmap_theme";
    const saved = localStorage.getItem(key);
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }
    setTheme("dark");
  }, [setTheme]);

  useEffect(() => {
    const key = "mindmap_theme";
    try {
      localStorage.setItem(key, theme);
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = documentLocaleFromAppLocale(locale);
  }, [locale]);

  return null;
}
