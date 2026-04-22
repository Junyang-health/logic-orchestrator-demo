import type { PptDeckStyleId } from "../../../lib/pptFrameworkExport";
import type { MessageKey } from "../../../i18n/messages";

/** HTTP statuses on which an enrich-batch request is retried (transient / overload). */
export const PPT_ENRICH_RETRY_STATUS = [502, 503, 504, 429] as const;

export const PPT_ENRICH_HTTP_RETRIES = 2;

/** Use a virtual list when the deck has more than this many slides. */
export const PPT_DECK_VIRTUALIZE_AT = 12;

export const PPT_DECK_STYLE_ROWS: { id: PptDeckStyleId; name: MessageKey; blurb: MessageKey }[] = [
  { id: "consulting_mbb", name: "ppt_deck_style_mbb", blurb: "ppt_deck_blurb_mbb" },
  { id: "government", name: "ppt_deck_style_government", blurb: "ppt_deck_blurb_government" },
  { id: "academic", name: "ppt_deck_style_academic", blurb: "ppt_deck_blurb_academic" },
  { id: "creative", name: "ppt_deck_style_creative", blurb: "ppt_deck_blurb_creative" }
];
