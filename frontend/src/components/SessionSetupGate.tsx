import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";

type Phase = "loading" | "ready" | "form";

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((x) => {
        if (typeof x === "object" && x && "msg" in x) return String((x as { msg: unknown }).msg);
        return JSON.stringify(x);
      })
      .join("; ");
  }
  return "";
}

export default function SessionSetupGate({
  backendBase,
  children
}: {
  backendBase: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("loading");
  const [statusUnreachable, setStatusUnreachable] = useState(false);
  const [primaryLlm, setPrimaryLlm] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${backendBase}/session/status`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { ready?: boolean };
        if (cancelled) return;
        setPhase(data.ready ? "ready" : "form");
        setStatusUnreachable(false);
      } catch {
        if (cancelled) return;
        setPhase("form");
        setStatusUnreachable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendBase]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setSubmitError(t("session_setup_key_required"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${backendBase}/session/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_llm: primaryLlm,
          api_key: trimmed,
          tavily_api_key: tavilyKey.trim(),
          model_id: modelId.trim()
        })
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = formatDetail((raw as { detail?: unknown }).detail) || res.statusText || t("session_setup_error");
        throw new Error(detail);
      }
      setPhase("ready");
      setStatusUnreachable(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("session_setup_error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-100 text-[13px] text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        {t("session_setup_checking")}
      </div>
    );
  }

  if (phase === "ready") return <>{children}</>;

  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-lg backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/95">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("session_setup_title")}</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-600 dark:text-slate-400">{t("session_setup_subtitle")}</p>

        {statusUnreachable ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-100">
            {t("session_setup_offline")}
          </p>
        ) : null}

        <form className="mt-5 flex flex-col gap-3" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            {t("session_setup_provider")}
            <select
              value={primaryLlm}
              onChange={(e) => setPrimaryLlm(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="gemini">{t("session_setup_option_gemini")}</option>
              <option value="deepseek">{t("session_setup_option_deepseek")}</option>
              <option value="kimi">{t("session_setup_option_kimi")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            {t("session_setup_api_key")}
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            {t("session_setup_model")} <span className="font-normal text-slate-500">({t("session_setup_model_optional")})</span>
            <input
              type="text"
              autoComplete="off"
              placeholder="gemini-2.5-flash · deepseek:deepseek-chat · kimi:kimi-k2.5"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            {t("session_setup_tavily")}
            <input
              type="password"
              autoComplete="off"
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          {submitError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="ios-button mt-1 w-full justify-center py-2.5 text-[13px] disabled:opacity-50"
          >
            {submitting ? t("session_setup_checking") : t("session_setup_submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
