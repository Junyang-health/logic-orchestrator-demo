import type { PptSlide } from "./pptFrameworkExport";

export function fwRowToSlide(row: Record<string, unknown>): PptSlide {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    subtitle: String(row.subtitle ?? ""),
    beat: String(row.beat ?? ""),
    main: String(row.main ?? ""),
    visual: String(row.visual ?? "")
  };
}

export function slidesFromFrameworkRecord(
  fw: Record<string, unknown> | null | undefined
): PptSlide[] {
  const slidesField =
    fw && typeof fw === "object" && "slides" in fw ? (fw as { slides?: unknown }).slides : undefined;
  const slidesRaw = Array.isArray(slidesField) ? slidesField : [];
  const out: PptSlide[] = [];
  for (const s of slidesRaw) {
    if (!s || typeof s !== "object") continue;
    const p = fwRowToSlide(s as Record<string, unknown>);
    if (p.id) out.push(p);
  }
  return out;
}

export function pptSlideToFrameworkRow(slide: Partial<PptSlide> & Pick<PptSlide, "id">): Record<string, string> {
  return {
    id: slide.id,
    title: slide.title ?? "",
    subtitle: slide.subtitle ?? "",
    beat: slide.beat ?? "",
    main: slide.main ?? "",
    visual: slide.visual ?? ""
  };
}

/** Replace/update one slide dict by id inside framework copy; preserves other keys on fw root. */
export function frameworkWithSlides(
  fw: Record<string, unknown> | undefined,
  slides: Record<string, unknown>[]
): Record<string, unknown> {
  const base = fw && typeof fw === "object" ? { ...fw } : {};
  base.slides = slides;
  return base;
}

/** Ordered slide rows for PATCH: preserve extra keys per slide, order follows `ordered`. */
export function orderedFrameworkSlideRows(
  fw: Record<string, unknown>,
  ordered: readonly PptSlide[]
): Record<string, unknown>[] {
  const slidesField =
    fw && typeof fw === "object" && "slides" in fw ? (fw as { slides?: unknown }).slides : undefined;
  const slidesRaw = Array.isArray(slidesField) ? slidesField : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const s of slidesRaw) {
    if (!s || typeof s !== "object") continue;
    const row = s as Record<string, unknown>;
    const id = String(row.id ?? "");
    if (id) byId.set(id, { ...row });
  }
  return ordered.map((p) => {
    const existing = byId.get(p.id);
    if (existing) return existing;
    return pptSlideToFrameworkRow(p) as Record<string, unknown>;
  });
}
