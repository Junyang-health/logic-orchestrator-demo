import type { CounselPersona } from "../../lib/counselApi";

export function counselInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const w = name.trim();
  return w.slice(0, 2).toUpperCase();
}

/** 2px ring + soft glow color (CSS color string). */
export function counselSignatureRing(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("buffett") || n.includes("buffet")) return "#d4af37";
  if (n.includes("combinator") || /\byc\b/.test(n) || n.includes("y combinator")) return "#22c55e";
  if (n.includes("bezos")) return "#f97316";
  if (n.includes("musk")) return "#38bdf8";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 72% 52%)`;
}

export function normSpeakerKey(s: string | null | undefined): string | null {
  const t = String(s || "").trim().toLowerCase();
  return t.length ? t : null;
}

export function inferDebateAddressee(
  utterance: string,
  speaker: string,
  personas: CounselPersona[]
): string | null {
  const sp = speaker.trim().toLowerCase();
  const low = utterance.toLowerCase();
  const sorted = [...personas].sort((a, b) => b.name.trim().length - a.name.trim().length);
  for (const p of sorted) {
    const pn = p.name.trim();
    if (pn.toLowerCase() === sp) continue;
    if (pn.length >= 2 && low.includes(pn.toLowerCase())) return p.name;
  }
  return null;
}
