import { describe, expect, it } from "vitest";
import { frameworkToMarkdown, frameworkToPptPrompt, type PptSlide } from "./pptFrameworkExport";

const sample: PptSlide[] = [
  {
    id: "a",
    title: "Intro",
    subtitle: "Hook",
    beat: "Set context",
    main: "Main text",
    visual: "Chart A"
  },
  {
    id: "b",
    title: "Outro",
    subtitle: "Close",
    beat: "",
    main: "More",
    visual: ""
  }
];

describe("frameworkToMarkdown", () => {
  it("includes deck style block and slide sections when labels are provided", () => {
    const md = frameworkToMarkdown(sample, "My deck", {
      storyBeat: "Beat",
      sectionContent: "Content",
      sectionVisual: "Visual",
      visualEmpty: "_(empty)_",
      deckStyleSectionTitle: "Style",
      deckStyleName: "MBB",
      deckStyleBlurb: "Consulting look"
    });
    expect(md).toContain("# My deck");
    expect(md).toContain("## Style");
    expect(md).toContain("**MBB**");
    expect(md).toContain("## Slide 1: Intro");
    expect(md).toContain("#### Beat");
    expect(md).toContain("Set context");
    expect(md).toContain("Chart A");
    expect(md).toContain("## Slide 2: Outro");
    expect(md).toContain("_(empty)_");
  });
});

describe("frameworkToPptPrompt", () => {
  it("weaves metadata and slide lines", () => {
    const p = frameworkToPptPrompt(sample, {
      intent: "Teach",
      audience: "Execs",
      style: "Dark",
      i18n: {
        contentLabel: "C",
        visualLabel: "V",
        visualFallback: "F"
      }
    });
    expect(p).toContain("Teach");
    expect(p).toContain("Execs");
    expect(p).toContain("Dark");
    expect(p).toContain("### Slide 1");
    expect(p).toContain("**Title:** Intro");
    expect(p).toContain("**Story beat:** Set context");
    expect(p).toContain("Chart A");
    expect(p).toContain("### Slide 2");
    expect(p).toContain("F");
  });
});
