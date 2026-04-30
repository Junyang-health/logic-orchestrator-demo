/** Shared async + error handling for the counsel flow (#3: less setBusy/setError duplication). */

export function counselErrorToMessage(e: unknown, t: (key: string) => string): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return t("counsel_error_generic");
}

type CounselBusySetter = (v: boolean | ((p: boolean) => boolean)) => void;

type CounselErrorSetter = (v: string | ((p: string) => string)) => void;

/**
 * Clears error, sets busy true, runs fn, then busy false. On failure sets a user-facing error (i18n fallback for non-Errors).
 * @returns whether fn completed without throwing.
 */
export async function counselRunAsync(
  opts: {
    setBusy: CounselBusySetter;
    setError: CounselErrorSetter;
    t: (key: string) => string;
    /** Logged with console.error in dev only */
    label?: string;
  },
  fn: () => Promise<void>
): Promise<boolean> {
  const { setBusy, setError, t, label } = opts;
  setBusy(true);
  setError("");
  try {
    await fn();
    return true;
  } catch (e) {
    if (import.meta.env.DEV && label) console.error(`[counsel:${label}]`, e);
    setError(counselErrorToMessage(e, t));
    return false;
  } finally {
    setBusy(false);
  }
}
