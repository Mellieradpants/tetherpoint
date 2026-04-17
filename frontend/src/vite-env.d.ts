/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYZE_API_BASE_URL: string;
  readonly VITE_ANALYZE_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}