/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PPT_ENRICH_BATCH_SIZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
