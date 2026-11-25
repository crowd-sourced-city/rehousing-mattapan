/// <reference types="vite/client" />

/** Build stamp, defined in vite.config.ts. */
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** PostHog project key; telemetry is off when unset. */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog ingestion host, e.g. https://eu.i.posthog.com (default: US). */
  readonly VITE_POSTHOG_HOST?: string;
}
