/** Build 0-based index batches for enrich API (max 8 indices per request on server). */
export function buildEnrichBatches(totalSlides: number, batchSize: number): number[][] {
  if (totalSlides < 1 || batchSize < 1) return [];
  const size = Math.min(8, Math.max(1, Math.floor(batchSize)));
  const batches: number[][] = [];
  for (let i = 0; i < totalSlides; i += size) {
    batches.push(
      Array.from({ length: Math.min(size, totalSlides - i) }, (_, k) => i + k)
    );
  }
  return batches;
}
