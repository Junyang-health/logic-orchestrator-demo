import { describe, expect, it } from "vitest";
import { buildEnrichBatches } from "./pptFrameworkBatches";

describe("buildEnrichBatches", () => {
  it("returns [] for empty or invalid input", () => {
    expect(buildEnrichBatches(0, 3)).toEqual([]);
    expect(buildEnrichBatches(5, 0)).toEqual([]);
  });

  it("chunks 0-based indices and caps batch at 8", () => {
    expect(buildEnrichBatches(10, 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9]
    ]);
    expect(buildEnrichBatches(10, 9)).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [8, 9]
    ]);
  });

  it("one batch when count ≤ batch size", () => {
    expect(buildEnrichBatches(4, 8)).toEqual([[0, 1, 2, 3]]);
  });
});
