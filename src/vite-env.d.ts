/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E365_LOCAL_PREVIEW?: string;
  readonly VITE_TOTVS_LOCAL_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
