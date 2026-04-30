import { useEffect, useMemo, useRef } from "react";
import { Graph, Node } from "@antv/x6";
import { Dnd } from "@antv/x6-plugin-dnd";
import { useI18n } from "../i18n/useI18n";
import useUiStore from "../store/useUiStore";

type PaletteItem = {
  id: string;
  label: string;
  type: string;
};

export default function SidebarPalette(props: { graph: Graph | null }) {
  const { t, locale } = useI18n();
  const sandboxMode = useUiStore((s) => s.sandboxMode);
  const dndRef = useRef<Dnd | null>(null);

  const PALETTE: PaletteItem[] = useMemo(
    () => [
      { id: "evidence", label: t("palette_evidence"), type: "evidence" },
      { id: "inferred", label: t("palette_inferred"), type: "inferred" }
    ],
    [t, locale]
  );

  const sourceNode = useMemo(() => {
    // Template node used for cloning during DnD.
    return new Node({
      shape: "mindmap-react-node",
      width: 280,
      height: 72,
      data: {
        id: "",
        type: "inferred",
        label: t("palette_new_node"),
        metadata: {},
        status: "draft"
      }
    });
  }, [t, locale]);

  useEffect(() => {
    if (!props.graph) return;
    dndRef.current = new Dnd({
      target: props.graph,
      getDragNode: () => {
        const isSandbox = Boolean((props.graph as any)?.prop?.("sandboxContext"));
        const clone = sourceNode.clone();
        const d = (clone.getData() ?? {}) as any;
        clone.setData({ ...d, status: isSandbox ? "draft" : "firm" }, { overwrite: true });
        return clone;
      }
    });
    return () => {
      dndRef.current = null;
    };
  }, [props.graph, sourceNode]);

  return (
    <div className="h-full w-[180px] border-r border-[var(--mm-border-subtle)] bg-[var(--mm-sidebar-bg)] p-3">
      <div className="mb-2 text-xs font-medium text-[var(--mm-text-title)]">{t("palette_title")}</div>
      <div className="mb-3 text-[11px] font-medium text-[var(--mm-text-muted)]">
        {t("palette_mode")}{" "}
        <span className="font-medium text-[var(--mm-text-title)]">{sandboxMode ? t("palette_sandbox") : t("palette_main")}</span>
      </div>
      <div className="space-y-2">
        {PALETTE.map((item) => (
          <button
            key={item.id}
            type="button"
            className="mm-sidebar-section w-full px-2 py-2 text-left text-xs text-[var(--mm-text-title)] transition hover:bg-[color-mix(in_srgb,var(--mm-sidebar-bg)_70%,var(--mm-card-bg))] dark:border-[var(--mm-border-subtle)] dark:bg-slate-950/40 dark:shadow-none dark:hover:bg-slate-900/50"
            onMouseDown={(e) => {
              if (!props.graph || !dndRef.current) return;
              const id = `n_${Math.random().toString(16).slice(2, 10)}`;
              const isSandbox = Boolean((props.graph as any).prop?.("sandboxContext"));
              const n = sourceNode.clone();
              n.setData(
                {
                  id,
                  type: item.type,
                  label: item.label,
                  metadata: {},
                  status: isSandbox ? "draft" : "firm"
                },
                { overwrite: true }
              );
              dndRef.current.start(n, e.nativeEvent as any);
            }}
          >
            <div className="font-medium">{item.label}</div>
            <div className="mt-0.5 text-[11px] font-medium text-[var(--mm-text-muted)]">{t("palette_drag_hint")}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

