import type { Dispatch, SetStateAction } from "react";
import type { MessageKey } from "../../i18n/messages";

export function assistantErrorToMessage(
  e: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return t("assistant_error_generic");
}

type BusySetter = Dispatch<SetStateAction<boolean>>;

/**
 * Clears panel error (optional), optional prepare(), setBusy(true), runs fn, clears busy.
 * On failure: user-facing message via setPanelError or onErrorMessage; optional onFailure(e).
 */
export async function assistantRunAsync(
  opts: {
    setBusy: BusySetter;
    t: (key: MessageKey, vars?: Record<string, string | number>) => string;
    setPanelError?: Dispatch<SetStateAction<string>>;
    onErrorMessage?: (msg: string) => void;
    prepare?: () => void;
    onFailure?: (e: unknown) => void;
    label?: string;
  },
  fn: () => Promise<void>
): Promise<boolean> {
  const { setBusy, t, label, setPanelError, onErrorMessage, prepare, onFailure } = opts;
  if (setPanelError) setPanelError("");
  prepare?.();
  setBusy(true);
  try {
    await fn();
    return true;
  } catch (e) {
    if (import.meta.env.DEV && label) console.error(`[assistant:${label}]`, e);
    const msg = assistantErrorToMessage(e, t);
    if (onErrorMessage) onErrorMessage(msg);
    else if (setPanelError) setPanelError(msg);
    onFailure?.(e);
    return false;
  } finally {
    setBusy(false);
  }
}

/** For non-boolean busy flags (e.g. MECE web search per-row id). */
export async function assistantRunLifecycle(
  opts: {
    t: (key: MessageKey, vars?: Record<string, string | number>) => string;
    setPanelError?: Dispatch<SetStateAction<string>>;
    onErrorMessage?: (msg: string) => void;
    begin: () => void;
    end: () => void;
    label?: string;
  },
  fn: () => Promise<void>
): Promise<boolean> {
  const { t, label, setPanelError, onErrorMessage, begin, end } = opts;
  if (setPanelError) setPanelError("");
  begin();
  try {
    await fn();
    return true;
  } catch (e) {
    if (import.meta.env.DEV && label) console.error(`[assistant:${label}]`, e);
    const msg = assistantErrorToMessage(e, t);
    if (onErrorMessage) onErrorMessage(msg);
    else if (setPanelError) setPanelError(msg);
    return false;
  } finally {
    end();
  }
}
