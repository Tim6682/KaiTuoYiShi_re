export {};

/// <reference types="vite/client" />

declare global {
  interface Window {
    __ROOT_MOUNTED__?: boolean;
    __PREBOOT_ERROR__?: string | null;
  }

  interface ImportMeta {
    readonly env: {
      readonly VITE_APP_PASSWORD_HASH: string;
      readonly MODE: string;
      readonly DEV: boolean;
      readonly PROD: boolean;
      readonly SSR: boolean;
      readonly BASE_URL: string;
      [key: string]: string | boolean | undefined;
    };
  }
}
