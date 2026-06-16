const DONE = "slide_deck_q_done_v1";
const STYLE = "slide_deck_q_style_v1";

export function readWizardDone(sessionId: string | null): boolean {
  if (!sessionId || typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(`${DONE}:${sessionId}`) === "1";
  } catch {
    return false;
  }
}

export function writeWizardDone(sessionId: string): void {
  try {
    sessionStorage.setItem(`${DONE}:${sessionId}`, "1");
  } catch {
    /* ignore */
  }
}

export function readWizardStyle(sessionId: string | null): string {
  if (!sessionId || typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(`${STYLE}:${sessionId}`) || "";
  } catch {
    return "";
  }
}

export function writeWizardStyle(sessionId: string, notes: string): void {
  try {
    sessionStorage.setItem(`${STYLE}:${sessionId}`, notes);
  } catch {
    /* ignore */
  }
}
