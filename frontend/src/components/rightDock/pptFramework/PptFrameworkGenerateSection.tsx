import { useI18n } from "../../../i18n/useI18n";
import type { PptGenPhase } from "./types";

type Props = {
  canGenerate: boolean;
  generateBusy: boolean;
  genPhase: PptGenPhase;
  onGenerate: () => void;
  onCancel: () => void;
};

export default function PptFrameworkGenerateSection(props: Props) {
  const { t } = useI18n();
  const { canGenerate, generateBusy, genPhase, onGenerate, onCancel } = props;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="ios-button-primary w-full py-2 text-sm font-semibold disabled:opacity-50"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        {generateBusy
          ? genPhase?.kind === "skeleton"
            ? t("ppt_gen_skeleton")
            : genPhase?.kind === "enrich"
              ? t("ppt_gen_enrich", { n: genPhase.batch, total: genPhase.batches })
              : genPhase?.kind === "reconcile"
                ? t("ppt_gen_reconcile")
                : t("ppt_generating")
          : t("ppt_generate")}
      </button>
      {generateBusy && genPhase ? (
        <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">{t("ppt_gen_step_hint")}</p>
      ) : null}
      {generateBusy ? (
        <button type="button" className="ios-button w-full py-1.5 text-xs text-slate-700 dark:text-slate-200" onClick={onCancel}>
          {t("ppt_gen_cancel")}
        </button>
      ) : null}
    </div>
  );
}
