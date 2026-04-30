import type { AssistantPanelMode } from "./assistantPanelMode";

/** Shown in chips and footer; composer also accepts `/blackswan` for black swan. */
export const SLASH_MODE_CHIP_ITEMS: { mode: AssistantPanelMode; label: string }[] = [
  { mode: "chat", label: "/chat" },
  { mode: "optimism", label: "/optimism" },
  { mode: "blackSwan", label: "/black-swan" },
  { mode: "mece", label: "/mece" },
  { mode: "roundtable", label: "/roundtable" },
  { mode: "counsel", label: "/counsel" }
];

/** A line containing only a supported slash command → target mode; otherwise null. */
export function tryParseSlashModeOnlyLine(raw: string): AssistantPanelMode | null {
  const m = raw.match(/^\s*\/(chat|optimism|blackswan|black-swan|mece|roundtable|counsel)\s*$/i);
  if (!m) return null;
  const g = m[1].toLowerCase().replace("black-swan", "blackswan");
  if (g === "chat") return "chat";
  if (g === "optimism") return "optimism";
  if (g === "blackswan") return "blackSwan";
  if (g === "mece") return "mece";
  if (g === "roundtable") return "roundtable";
  if (g === "counsel") return "counsel";
  return null;
}
