export type PptSlide = {
  id: string;
  title: string;
  subtitle: string;
  /** One-line story beat (skeleton phase); how this slide advances the arc. */
  beat: string;
  main: string;
  /** Visual anchor + how content is presented; prefer infographics, charts, tables for highlight/contrast. */
  visual: string;
};

/** API + UI preset — must match backend `PptDeckStyle`. */
export type PptDeckStyleId = "consulting_mbb" | "government" | "academic" | "creative";

export type PptFrameworkMdLabels = {
  storyBeat?: string;
  sectionContent: string;
  sectionVisual: string;
  visualEmpty: string;
  /** Deck style section in exported Markdown (name + long blurb for the chosen preset). */
  deckStyleSectionTitle?: string;
  deckStyleName?: string;
  deckStyleBlurb?: string;
};

export function frameworkToMarkdown(
  slides: PptSlide[],
  titleLine?: string,
  labels?: PptFrameworkMdLabels
): string {
  const L = labels ?? {
    sectionContent: "Content & message",
    sectionVisual: "Visual anchor & presentation",
    visualEmpty: "_(TBD — prefer infographic, chart, or table for highlight and contrast.)_"
  };
  const head = titleLine ? `# ${titleLine}\n\n` : "# PPT framework\n\n";
  const deck =
    L.deckStyleSectionTitle && L.deckStyleName && L.deckStyleBlurb
      ? `## ${L.deckStyleSectionTitle}\n\n**${L.deckStyleName}** — ${L.deckStyleBlurb}\n\n---\n\n`
      : "";
  const body = slides
    .map((s, i) => {
      const vis = (s.visual || "").trim();
      const beat = (s.beat || "").trim();
      const beatBlock =
        L.storyBeat && beat ? `#### ${L.storyBeat}\n\n${beat}\n\n` : beat ? `_${beat}_\n\n` : "";
      return (
        `## Slide ${i + 1}: ${s.title || "(untitled)"}\n\n` +
        `### ${s.subtitle || "—"}\n\n` +
        beatBlock +
        `#### ${L.sectionContent}\n\n` +
        `${(s.main || "").trim()}\n\n` +
        `#### ${L.sectionVisual}\n\n` +
        (vis ? `${vis}\n` : `${L.visualEmpty}\n`)
      );
    })
    .join("\n---\n\n");
  return head + deck + body;
}

export type PptPromptI18n = {
  contentLabel: string;
  visualLabel: string;
  visualFallback: string;
};

/** Prompt-style brief for an external PPT or image generator. */
export function frameworkToPptPrompt(
  slides: PptSlide[],
  options: {
    style?: string;
    audience?: string;
    intent?: string;
    /** Section titles for the exported prompt (use UI locale). */
    i18n?: PptPromptI18n;
    /** Preset: title line + blurb to steer an external PPT / image model. */
    deckStyleName?: string;
    deckStyleBlurb?: string;
  }
): string {
  const { style = "", audience = "", intent = "" } = options;
  const I = options.i18n ?? {
    contentLabel: "Content & message (body)",
    visualLabel: "Visual anchor & data presentation (prioritize infographics, charts, tables for highlight and contrast)",
    visualFallback:
      "Specify the dominant graphic, chart, or table; layout split, callouts, and what contrasts with supporting text."
  };
  const deck =
    options.deckStyleName && options.deckStyleBlurb
      ? `**Deck style (mandatory): ${options.deckStyleName}**\n${options.deckStyleBlurb}`
      : "";
  const pre = [
    "You are given a deck outline. Create slides that follow this structure. Prefer infographics, charts, and tables over walls of text for emphasis and contrast, consistent with the deck style below.",
    deck,
    intent && `**Purpose / intent:**\n${intent}`,
    audience && `**Audience:**\n${audience}`,
    style && `**Additional look & feel (on top of deck style):**\n${style}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const slidesBlock = slides
    .map((s, i) => {
      const vis = (s.visual || "").trim();
      return [
        `### Slide ${i + 1}`,
        `- **Title:** ${s.title}`,
        `- **Subtitle:** ${s.subtitle}`,
        ...(s.beat ? ([`- **Story beat:** ${s.beat}`] as const) : []),
        `- **${I.contentLabel}:**`,
        s.main,
        `- **${I.visualLabel}:**`,
        vis || I.visualFallback
      ].join("\n");
    })
    .join("\n\n");
  return [pre, "", "## Slides to realize", "", slidesBlock].filter(Boolean).join("\n");
}

const TEXT_EXT = /\.(txt|md|mdx|csv|json|ts|tsx|js|mjs|cjs|py|yml|yaml|html|css|xml|log|env)$/i;

export async function readSourceFileSnippets(
  files: { id: string; file: File }[]
): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const e of files) {
    const f = e.file;
    const name = f.name;
    if (f.size > 1_200_000) {
      out.push({ name, text: `[Skipped: file larger than ~1.2MB]\n` });
      continue;
    }
    if (f.type.startsWith("text/") || TEXT_EXT.test(f.name) || f.type === "application/json") {
      try {
        const t = await f.text();
        out.push({ name, text: t.length > 80_000 ? t.slice(0, 80_000) + "\n…(truncated)" : t });
      } catch {
        out.push({ name, text: `[Could not read text: ${name}]` });
      }
    } else {
      out.push({ name, text: `[Non-text or binary file — not inlined: type ${f.type || "unknown"}]\n` });
    }
  }
  return out;
}
