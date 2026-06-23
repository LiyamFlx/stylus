/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_MYSCRIPT_APP_KEY?: string;
  readonly VITE_MYSCRIPT_HMAC_KEY?: string;
  readonly VITE_MYSCRIPT_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
