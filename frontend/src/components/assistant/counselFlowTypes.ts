import type { MindmapJson } from "../../types/mindmap";

/** Props for counsel flow — used by the runtime hook and thin shell. */
export type CounselFlowProps = {
  backendBase: string;
  projectId: string;
  selectedNodeId: string | undefined;
  mainGraph: MindmapJson | null;
  sandboxGraph: MindmapJson;
  sourceFileIds: string[];
  payloadSkills: { name: string; instruction: string; enabled: boolean }[];
  builtinSkills: { webSearch: boolean; financialAnalyst: boolean };
  sandboxMode: boolean;
  loadMainGraph: (mm: MindmapJson) => void;
  rtLib: { name: string; instruction: string }[];
  onPersistPersonaToLib?: (name: string, instruction: string) => void;
  onUpdatePersonaInLib?: (name: string, instruction: string) => void;
  onRemovePersonaFromLib?: (name: string) => void;
};
