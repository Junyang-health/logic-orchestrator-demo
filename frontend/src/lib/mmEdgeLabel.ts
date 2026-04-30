/** X6 edge label markup: canvas-matched pill + monospace (~10px). */
export function mmEdgeLabelBlock(text: string, isDraft: boolean) {
  return {
    attrs: {
      text: {
        text,
        fill: isDraft ? "var(--mm-edge-label-text-draft)" : "var(--mm-edge-label-text-firm)",
        fontSize: 10,
        fontWeight: 500,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace'
      },
      rect: {
        fill: "var(--mm-edge-label-pill-fill)",
        stroke: "var(--mm-edge-label-pill-stroke)",
        strokeWidth: 0.5,
        rx: 2,
        ry: 2
      }
    }
  };
}
