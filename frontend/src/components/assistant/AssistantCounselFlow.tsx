import type { CounselFlowProps } from "./counselFlowTypes";
import CounselFlowView from "./CounselFlowView";
import { useCounselFlowRuntime } from "./useCounselFlowRuntime";

export type { CounselFlowProps };

export default function AssistantCounselFlow(props: CounselFlowProps) {
  const runtime = useCounselFlowRuntime(props);

  if (!props.selectedNodeId) {
    return <p className="text-[11px] text-amber-800 dark:text-amber-200">{runtime.t("counsel_err_node")}</p>;
  }

  return <CounselFlowView runtime={runtime} />;
}
