export type ReviewComment = {
  id: string;
  nodeId: string;
  text: string;
  persona: string;
};

export const REVIEW_PERSONAS = [
  "Skeptical Investor",
  "Risk Analyst",
  "Friendly Coach",
  "Devil's Advocate"
] as const;
