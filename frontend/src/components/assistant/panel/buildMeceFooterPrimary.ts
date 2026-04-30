import type { MessageKey } from "../../../i18n/messages";
import type { AssistantPanelMode } from "../assistantPanelMode";
import type { MeceEvidenceRow, MeceScanBundle } from "../assistantTypes";

export type MeceFooterPrimary = {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
} | null;

export function buildMeceFooterPrimary(opts: {
  mode: AssistantPanelMode;
  selectedNodeId: string | undefined;
  meceScanBundle: MeceScanBundle | null;
  meceEvidenceResults: MeceEvidenceRow[] | undefined;
  meceSelectedCount: number;
  simBusy: boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  meceScan: () => void;
  meceEvidence: () => void;
  meceApply: () => void;
}): MeceFooterPrimary {
  const {
    mode,
    selectedNodeId,
    meceScanBundle,
    meceEvidenceResults,
    meceSelectedCount,
    simBusy,
    t,
    meceScan,
    meceEvidence,
    meceApply
  } = opts;
  if (mode !== "mece") return null;
  if (!selectedNodeId) {
    return { label: t("mece_footer_scan"), disabled: true, busy: false, onClick: () => {} };
  }
  if (!meceScanBundle) {
    return {
      label: simBusy ? t("mece_scanning") : t("mece_footer_scan"),
      disabled: simBusy,
      busy: simBusy,
      onClick: () => void meceScan()
    };
  }
  if (!meceEvidenceResults?.length) {
    return {
      label: simBusy ? t("mece_checking") : t("mece_footer_verify"),
      disabled: simBusy || meceSelectedCount < 1,
      busy: simBusy,
      onClick: () => void meceEvidence()
    };
  }
  return {
    label: simBusy ? t("footer_applying") : t("mece_footer_apply"),
    disabled: simBusy || meceSelectedCount < 1,
    busy: simBusy,
    onClick: () => void meceApply()
  };
}
