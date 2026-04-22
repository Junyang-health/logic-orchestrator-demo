import { useCallback } from "react";
import useUiStore, { type AppLocale } from "../store/useUiStore";
import { MESSAGES, type MessageKey } from "./messages";

function interpolate(
  template: string,
  vars?: Record<string, string | number> | undefined
): string {
  if (!vars) return template;
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export function useI18n() {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      const raw = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? String(key);
      return interpolate(raw, vars);
    },
    [locale]
  );
  return { t, locale, setLocale } as const;
}

export function documentLocaleFromAppLocale(loc: AppLocale): string {
  return loc === "zh" ? "zh-Hans" : "en";
}
