import { collectBranchSubgraph } from "./graphBranch";
import type { MindmapJson, MindmapNode } from "../types/mindmap";

export type OptimismMetric = "TAM" | "SOM" | "ARR";

const METRIC_ORDER: OptimismMetric[] = ["TAM", "SOM", "ARR"];

/** Map critical_values label (any language) to TAM / SOM / ARR. */
export function metricFromCriticalLabel(label: string): OptimismMetric | null {
  const raw = (label || "").trim();
  if (!raw) return null;
  const u = raw.toUpperCase().replace(/\s+/g, " ");
  if (
    /\bTAM\b|总可达|可达市场|整体市场|市场规模|市场体量|总体规模|可触达市场/i.test(raw) ||
    u.includes("TOTAL ADDRESSABLE")
  ) {
    return "TAM";
  }
  if (/\bSOM\b|\bSAM\b|可服务|可获得|可及|细分(市场)?|SERVICEABLE|可获市场/i.test(raw)) return "SOM";
  if (/\bARR\b|年经常性收入|经常性收入|年营收|营收|销售收入|RECURRING\s*REV/i.test(raw)) return "ARR";
  return null;
}

/** Non–critical_values metadata string fields (notes, snippets, etc.). */
function metadataSurfaceStrings(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (k === "critical_values") continue;
    if (typeof v === "string" && v.trim()) out.push(v);
    else if (typeof v === "number" && Number.isFinite(v)) out.push(String(v));
  }
  return out;
}

/** First money-like number after a keyword (capturing group 1 = tail to parse). */
function valueAfterKeyword(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m?.[1]) return null;
  const v = parseLooseMoneyToNumber(m[1].trim());
  return v != null && v > 0 ? v : null;
}

/**
 * Infer TAM/SOM/ARR from node label + loose metadata (keywords + nearby figures).
 * Used when `critical_values` omits structured metrics.
 */
function extractMetricsFromSurfaceText(text: string): Partial<Record<OptimismMetric, number>> {
  const t = (text || "").trim();
  if (!t) return {};
  const out: Partial<Record<OptimismMetric, number>> = {};
  const tail = "([^\\n,，;；]{1,160})";

  const tam =
    valueAfterKeyword(
      t,
      new RegExp(`(?:\\bTAM\\b|市场规模|市场体量|总可达|可达市场|整体市场|总体规模|可触达市场|TOTAL\\s*ADDRESSABLE)\\s*[：:=]?\\s*${tail}`, "i")
    ) ?? (/\bTAM\b|市场规模|市场体量|总可达|可达市场/i.test(t) ? parseLooseMoneyToNumber(t) : null);
  if (tam != null) out.TAM = tam;

  const som =
    valueAfterKeyword(
      t,
      new RegExp(`(?:\\bSOM\\b|\\bSAM\\b|可服务|可获得|可及|细分(?:市场)?|SERVICEABLE|可获市场)\\s*[：:=]?\\s*${tail}`, "i")
    ) ?? (/\bSOM\b|\bSAM\b|可服务市场/i.test(t) ? parseLooseMoneyToNumber(t) : null);
  if (som != null) out.SOM = som;

  const arr =
    valueAfterKeyword(
      t,
      new RegExp(`(?:\\bARR\\b|年经常性|经常性收入|年营收|销售收入|RECURRING)\\s*[：:=]?\\s*${tail}`, "i")
    ) ?? (/\bARR\b|年经常性收入|年营收/i.test(t) ? parseLooseMoneyToNumber(t) : null);
  if (arr != null) out.ARR = arr;

  return out;
}

/** Loose parse: supports 1.2B, $3M, 1200万, 10亿, plain decimals. */
export function parseLooseMoneyToNumber(raw: string): number | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  let mult = 1;
  if (/亿|億/.test(s)) mult *= 1e8;
  else if (/万|萬/.test(s)) mult *= 1e4;
  else if (/\bb\b(?!ytes)/i.test(lower)) mult *= 1e9;
  else if (/\bm\b(?!b)/i.test(lower)) mult *= 1e6;
  else if (/\bk\b/i.test(lower)) mult *= 1e3;

  const numMatch = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return null;
  const n = Number(numMatch[0]);
  if (!Number.isFinite(n)) return null;
  return n * mult;
}

export type BranchFinancialExtract = {
  /** Parsed numbers (first strong match per metric along branch, selected node first). */
  tam: number | null;
  som: number | null;
  arr: number | null;
  /** Which node id contributed each baseline (for UX). */
  sourceNodeId: Partial<Record<OptimismMetric, string>>;
  /** Optional drivers for chain recompute on server. */
  targetSegmentPct: number | null;
  arpaYear: number | null;
  customersTotal: number | null;
  penetrationPct: number | null;
};

function nodeCriticalArray(n: MindmapNode): { label: string; value: string }[] {
  const md = n.metadata;
  if (!md || typeof md !== "object") return [];
  const cv = (md as { critical_values?: unknown }).critical_values;
  if (!Array.isArray(cv)) return [];
  const out: { label: string; value: string }[] = [];
  for (const row of cv) {
    if (!row || typeof row !== "object") continue;
    const label = String((row as { label?: unknown }).label ?? "").trim();
    const value = String((row as { value?: unknown }).value ?? "").trim();
    if (!label || !value) continue;
    out.push({ label, value });
  }
  return out;
}

function pctFromLabel(label: string, value: string): number | null {
  const m = metricFromCriticalLabel(label);
  if (m !== "TAM" && m !== "SOM" && m !== "ARR") {
    if (/\b(segment|细分|penetration|渗透|customers?|客户)\b/i.test(label)) {
      const n = parseLooseMoneyToNumber(value.replace(/%/g, ""));
      if (n == null) return null;
      return n > 1 && n <= 100 ? n : n <= 1 ? n * 100 : null;
    }
  }
  return null;
}

/** BFS node ids from root following edges source → target. */
function branchNodeIdsOrdered(rootId: string, graph: MindmapJson): string[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (!ids.has(rootId)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const q = [rootId];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const e of graph.edges) {
      if (e.source === id && ids.has(e.target) && !seen.has(e.target)) q.push(e.target);
    }
  }
  return out;
}

/**
 * Pull TAM / SOM (SAM) / ARR and driver fields from branch critical_values.
 * Prioritises the selected node, then BFS order.
 */
export function extractBranchFinancialBaselines(branchRootId: string, graph: MindmapJson): BranchFinancialExtract {
  const branch = collectBranchSubgraph(branchRootId, graph);
  const order = branchNodeIdsOrdered(branchRootId, branch);
  const preferFirst = [branchRootId, ...order.filter((id) => id !== branchRootId)];
  const byId = new Map(branch.nodes.map((n) => [n.id, n]));

  const acc: BranchFinancialExtract = {
    tam: null,
    som: null,
    arr: null,
    sourceNodeId: {},
    targetSegmentPct: null,
    arpaYear: null,
    customersTotal: null,
    penetrationPct: null
  };

  const trySet = (m: OptimismMetric, val: number, nodeId: string) => {
    if (val == null || !Number.isFinite(val)) return;
    if (m === "TAM" && acc.tam == null) {
      acc.tam = val;
      acc.sourceNodeId.TAM = nodeId;
    }
    if (m === "SOM" && acc.som == null) {
      acc.som = val;
      acc.sourceNodeId.SOM = nodeId;
    }
    if (m === "ARR" && acc.arr == null) {
      acc.arr = val;
      acc.sourceNodeId.ARR = nodeId;
    }
  };

  for (const nid of preferFirst) {
    const n = byId.get(nid);
    if (!n) continue;
    for (const { label, value } of nodeCriticalArray(n)) {
      const m = metricFromCriticalLabel(label);
      if (m) {
        const v = parseLooseMoneyToNumber(value);
        if (v != null) trySet(m, v, nid);
      }
      const pl = label.toLowerCase();
      if (/segment|细分|tam\s*share|可获/.test(pl) && acc.targetSegmentPct == null) {
        const p = pctFromLabel(label, value);
        if (p != null) acc.targetSegmentPct = p;
      }
      if (/arpa|客单价|年合同|annual\s*contract/i.test(pl) && acc.arpaYear == null) {
        const v = parseLooseMoneyToNumber(value);
        if (v != null) acc.arpaYear = v;
      }
      if (/customer|客户数|accounts?/i.test(pl) && acc.customersTotal == null) {
        const v = parseLooseMoneyToNumber(value);
        if (v != null) acc.customersTotal = v;
      }
      if (/penetration|渗透/.test(pl) && acc.penetrationPct == null) {
        const p = pctFromLabel(label, value);
        if (p != null) acc.penetrationPct = p;
      }
    }

    /** Fallback: node title / notes often carry TAM·SOM·ARR without structured critical_values. */
    const md = (n.metadata && typeof n.metadata === "object" ? n.metadata : {}) as Record<string, unknown>;
    const surfaceChunks = [n.label, ...metadataSurfaceStrings(md)];
    for (const chunk of surfaceChunks) {
      const inferred = extractMetricsFromSurfaceText(chunk);
      for (const k of METRIC_ORDER) {
        const v = inferred[k];
        if (v != null) trySet(k, v, nid);
      }
    }
  }

  return acc;
}

export function availableMetrics(ex: BranchFinancialExtract): OptimismMetric[] {
  return METRIC_ORDER.filter((m) =>
    m === "TAM" ? ex.tam != null : m === "SOM" ? ex.som != null : ex.arr != null
  );
}

export type AffectedNodeHint = { nodeId: string; label: string; reason: string };

/**
 * Snake_case ids like `rev_evidence_tam` fail `\btam\b` because `_` is a word char in JS.
 * Split on non-alphanumeric and require an exact metric token (tam / som / sam / arr).
 */
function idContainsMetricToken(nodeId: string, focus: OptimismMetric): boolean {
  const tokens = nodeId.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (focus === "TAM") return tokens.includes("tam");
  if (focus === "SOM") return tokens.includes("som") || tokens.includes("sam");
  return tokens.includes("arr");
}

/** Abbrev appearance in text: not glued inside a longer latin token (e.g. avoid "tom" for TAM). */
function textHasMetricAbbrev(text: string, abbrev: "tam" | "som" | "sam" | "arr"): boolean {
  const re = new RegExp(`(?:^|[^a-z0-9])${abbrev}(?:$|[^a-z0-9])`, "i");
  return re.test(text);
}

/** Heuristic: node is relevant to the current stress metric (critical_values first, then text/id). */
function branchNodeMatchesStressFocus(n: MindmapNode, focus: OptimismMetric): boolean {
  for (const { label } of nodeCriticalArray(n)) {
    const m = metricFromCriticalLabel(label);
    if (m === focus) return true;
  }
  if (idContainsMetricToken(n.id, focus)) return true;

  const blob = `${n.id}\n${n.label}\n${JSON.stringify(n.metadata ?? {})}`.toLowerCase();
  if (focus === "TAM") {
    return (
      textHasMetricAbbrev(blob, "tam") ||
      /总可达|可达市场|市场规模|市场体量|可触达|total\s*addressable|addressable\s*market/i.test(blob)
    );
  }
  if (focus === "SOM") {
    return (
      textHasMetricAbbrev(blob, "som") ||
      textHasMetricAbbrev(blob, "sam") ||
      /serviceable|可服务|可获得|可获|细分市场|serviceable\s+obtainable/i.test(blob)
    );
  }
  return (
    textHasMetricAbbrev(blob, "arr") ||
    /recurring|经常性|年经常性|年营收|annual\s*recurring|\bmrr\b|\barpa\b|客单价|客户数|accounts?/i.test(blob)
  );
}

/** Branch nodes to review under the selected stress metric (excludes baseline source anchors). */
export function findAffectedBranchNodes(
  branchRootId: string,
  graph: MindmapJson,
  focus: OptimismMetric,
  sourceNodeId: Partial<Record<OptimismMetric, string>>
): AffectedNodeHint[] {
  const branch = collectBranchSubgraph(branchRootId, graph);
  const anchor = new Set(
    [sourceNodeId.TAM, sourceNodeId.SOM, sourceNodeId.ARR].filter((x): x is string => Boolean(x))
  );

  const hints: AffectedNodeHint[] = [];
  for (const n of branch.nodes) {
    if (anchor.has(n.id)) continue;
    if (!branchNodeMatchesStressFocus(n, focus)) continue;
    hints.push({
      nodeId: n.id,
      label: n.label,
      reason: `Related to ${focus} stress; review if ${focus} change should align.`
    });
  }
  return hints.slice(0, 24);
}

export function snapDeltaPct(raw: number): number {
  const s = Math.round(raw / 10) * 10;
  return Math.max(-100, Math.min(100, s));
}

export type MeterInputs = {
  tam_total: number | null;
  target_segment_pct: number | null;
  arpa_year: number | null;
  customers_total: number | null;
  penetration_pct: number | null;
  baseline_som_override: number | null;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Derive TAM / SOM / ARR from driver inputs (same rules as backend meter scenario). */
export function deriveMetricsFromMeterInputs(inp: MeterInputs): Record<OptimismMetric, number | null> {
  const tam = inp.tam_total;
  const seg = inp.target_segment_pct;
  const arpa = inp.arpa_year;
  const customers = inp.customers_total;
  const pen = inp.penetration_pct;

  let sam: number | null = null;
  if (tam != null && seg != null) sam = tam * (clamp(seg, 0, 100) / 100);
  else if (inp.baseline_som_override != null && Number.isFinite(inp.baseline_som_override)) {
    sam = inp.baseline_som_override;
  }

  let arr: number | null = null;
  if (customers != null && pen != null && arpa != null) {
    arr = customers * (clamp(pen, 0, 100) / 100) * arpa;
  } else if (sam != null && pen != null && arpa == null) {
    arr = sam * (clamp(pen, 0, 100) / 100);
  }

  return { TAM: tam, SOM: sam, ARR: arr };
}

/** Mirrors backend `compute_optimism_meter_scenario` for live UI preview. */
export function computeMeterPreview(
  focus: OptimismMetric,
  deltaPct: number,
  inp: MeterInputs
): {
  delta_pct: number;
  before: Record<OptimismMetric, number | null>;
  after: Record<OptimismMetric, number | null>;
  pctLabel: Record<OptimismMetric, string | null>;
} {
  const dp = snapDeltaPct(deltaPct);
  const m = 1 + dp / 100;
  const tam = inp.tam_total;
  const seg = inp.target_segment_pct;
  const arpa = inp.arpa_year;
  const customers = inp.customers_total;
  const pen = inp.penetration_pct;

  const derived = deriveMetricsFromMeterInputs(inp);
  const sam = derived.SOM;
  const arr = derived.ARR;

  const before: Record<OptimismMetric, number | null> = { ...derived };
  const after: Record<OptimismMetric, number | null> = { TAM: derived.TAM, SOM: derived.SOM, ARR: derived.ARR };

  const f = focus;
  if (f === "TAM" && tam != null) {
    const nt = tam * m;
    after.TAM = nt;
    if (seg != null) after.SOM = nt * (clamp(seg, 0, 100) / 100);
    if (customers != null && pen != null && arpa != null) {
      after.ARR = customers * (clamp(pen, 0, 100) / 100) * arpa;
    } else if (after.SOM != null && pen != null && arpa == null) {
      after.ARR = after.SOM * (clamp(pen, 0, 100) / 100);
    }
  } else if (f === "SOM" && sam != null) {
    const ns = sam * m;
    after.SOM = ns;
    if (tam != null && seg != null && seg > 0) after.TAM = ns / (clamp(seg, 0, 100) / 100);
    if (customers != null && pen != null && arpa != null) {
      after.ARR = customers * (clamp(pen, 0, 100) / 100) * arpa;
    } else if (after.SOM != null && pen != null && arpa == null) {
      after.ARR = after.SOM * (clamp(pen, 0, 100) / 100);
    }
  } else if (f === "ARR" && arr != null) {
    after.ARR = arr * m;
  }

  const pct = (old: number | null, neu: number | null): string | null => {
    if (old == null || neu == null || old === 0) return null;
    const p = ((neu - old) / old) * 100;
    return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  };

  return {
    delta_pct: dp,
    before,
    after,
    pctLabel: {
      TAM: pct(before.TAM, after.TAM),
      SOM: pct(before.SOM, after.SOM),
      ARR: pct(before.ARR, after.ARR)
    }
  };
}

export function formatMoneyShort(n: number, currency = "USD"): string {
  if (!Number.isFinite(n)) return "—";
  const cur = (currency || "USD").toUpperCase();
  const sign = cur === "USD" || cur === "CAD" || cur === "AUD" ? "$" : "";
  const x = Math.abs(n);
  if (x >= 1e9) return `${n < 0 ? "-" : ""}${sign}${(x / 1e9).toFixed(2)}B ${cur}`;
  if (x >= 1e6) return `${n < 0 ? "-" : ""}${sign}${(x / 1e6).toFixed(2)}M ${cur}`;
  if (x >= 1e3) return `${n < 0 ? "-" : ""}${sign}${(x / 1e3).toFixed(2)}K ${cur}`;
  return `${n < 0 ? "-" : ""}${sign}${Math.round(x).toLocaleString()} ${cur}`;
}

export function branchExtractToMeterInputs(ex: BranchFinancialExtract): MeterInputs {
  const useSomOverride = ex.som != null && (ex.tam == null || ex.targetSegmentPct == null);
  return {
    tam_total: ex.tam,
    target_segment_pct: ex.targetSegmentPct,
    arpa_year: ex.arpaYear,
    customers_total: ex.customersTotal,
    penetration_pct: ex.penetrationPct,
    baseline_som_override: useSomOverride ? ex.som : null
  };
}
