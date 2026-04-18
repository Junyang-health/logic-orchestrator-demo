from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class ExcelSummary:
    filename: str
    sheets: list[str]
    summary_text: str
    evidence_snippets: list[str]


def _detect_date_columns(df: pd.DataFrame) -> list[str]:
    cols: list[str] = []
    for c in df.columns:
        s = df[c]
        if pd.api.types.is_datetime64_any_dtype(s):
            cols.append(str(c))
            continue
        if pd.api.types.is_object_dtype(s):
            sample = s.dropna().astype(str).head(30)
            if sample.empty:
                continue
            parsed = pd.to_datetime(sample, errors="coerce", utc=False)
            ok = parsed.notna().mean()
            if ok >= 0.7:
                cols.append(str(c))
    return cols


def _trend_for_numeric_series(s: pd.Series) -> str | None:
    ss = pd.to_numeric(s, errors="coerce").dropna()
    if ss.shape[0] < 8:
        return None
    # Trend heuristic: compare early vs late quartiles.
    q = max(2, ss.shape[0] // 4)
    early = ss.iloc[:q].mean()
    late = ss.iloc[-q:].mean()
    if early == 0 and late == 0:
        return "flat (near zero)"
    if early == 0:
        return "increasing"
    pct = (late - early) / (abs(early) + 1e-9)
    if pct > 0.15:
        return f"increasing (~{pct*100:.0f}% from early to late)"
    if pct < -0.15:
        return f"decreasing (~{abs(pct)*100:.0f}% from early to late)"
    return "flat / stable"


def summarize_excel(*, filename: str, content: bytes, max_rows_preview: int = 40) -> ExcelSummary:
    bio = io.BytesIO(content)
    xls = pd.ExcelFile(bio)

    lines: list[str] = [f"Excel file: {filename}", f"Sheets: {', '.join(xls.sheet_names)}"]
    evidence: list[str] = []

    for sheet in xls.sheet_names[:10]:
        df = xls.parse(sheet_name=sheet)
        lines.append("")
        lines.append(f"Sheet: {sheet}")
        lines.append(f"Shape: {df.shape[0]} rows x {df.shape[1]} cols")

        headers = [str(c) for c in df.columns.tolist()]
        lines.append(f"Headers: {headers}")
        evidence.append(f"{filename} / {sheet} headers: {headers[:12]}")

        # Missingness + dtypes
        dtypes = {str(c): str(df[c].dtype) for c in df.columns[:25]}
        missing = {str(c): int(df[c].isna().sum()) for c in df.columns[:25]}
        lines.append(f"Column dtypes (first 25): {dtypes}")
        lines.append(f"Missing values (first 25): {missing}")

        date_cols = _detect_date_columns(df)
        if date_cols:
            lines.append(f"Detected date-like columns: {date_cols}")

        # Numeric trends
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        trends: dict[str, Any] = {}
        for c in numeric_cols[:15]:
            t = _trend_for_numeric_series(df[c])
            if t:
                trends[str(c)] = t
        if trends:
            lines.append(f"Trend heuristics (numeric, first 15): {trends}")
            evidence.append(f"{filename} / {sheet} trends: {list(trends.items())[:6]}")

        # Example rows (for evidence snippets)
        preview = df.head(max_rows_preview)
        if not preview.empty:
            snippet = preview.to_csv(index=False).splitlines()[:8]
            evidence.append(f"{filename} / {sheet} preview:\n" + "\n".join(snippet))

    summary_text = "\n".join(lines).strip()
    return ExcelSummary(filename=filename, sheets=xls.sheet_names, summary_text=summary_text, evidence_snippets=evidence)

