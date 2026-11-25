/**
 * Usability telemetry (PostHog). One small wrapper so the rest of the app only
 * calls track(), and the vendor could be swapped without touching pages.
 *
 * Privacy rules (see TELEMETRY.md):
 * - Off unless VITE_POSTHOG_KEY is set at build time, and never on localhost or
 *   under automated browsers (tests).
 * - No cookies: the anonymous ID lives in sessionStorage (this tab only).
 * - Never send an address or lot ID. Events describe lots by coarse traits only,
 *   the `?p=<lot>` URL parameter is stripped from every URL PostHog records,
 *   and autocapture masks element text.
 * - Session replay only for usability-study participants who open a study link
 *   (`?study=P07`), with all typed input and addresses masked.
 */
import type { PostHog } from 'posthog-js';

type Props = Record<string, string | number | boolean | null | undefined>;

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const STUDY_KEY = 'adu-study-participant';
const DEBUG_KEY = 'adu-telemetry-debug';

/** True when this build has a PostHog key (it may still be off, e.g. on localhost). */
export const telemetryConfigured = !!KEY;

/** Elements showing an address get this class; replays blank their text. */
export const PRIVATE = 'ph-private';

let ph: PostHog | null = null;
let queue: [string, Props | undefined][] = [];
let started = false;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Debug mode (for tests and for checking events by hand): `?telemetry=debug`. */
function debug() {
  return storage()?.getItem(DEBUG_KEY) === '1';
}

/** Reads `study` / `telemetry` parameters from the query string or from inside the hash route. */
function urlParam(name: string): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get(name);
  if (fromSearch) return fromSearch;
  const h = window.location.hash;
  const i = h.indexOf('?');
  return i >= 0 ? new URLSearchParams(h.slice(i + 1)).get(name) : null;
}

/** The study participant code for this tab, if the visitor arrived via a study link. */
export function participant(): string | null {
  const s = storage();
  const fromUrl = urlParam('study');
  if (fromUrl && /^[A-Za-z0-9_-]{1,24}$/.test(fromUrl)) s?.setItem(STUDY_KEY, fromUrl);
  return s?.getItem(STUDY_KEY) ?? null;
}

/** Removes the lot ID (`p=`) from a URL before anything leaves the browser. */
export function scrubUrl(url: string): string {
  return url.replace(/([?&])p=[^&#]*&?/g, '$1').replace(/[?&](#|$)/, '$1');
}

/** Where this build is running, so preview and live-site data can be separated. */
function environment() {
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return 'local';
  return window.location.pathname.includes('/pr-preview/') ? 'preview' : 'production';
}

function enabled() {
  return !!KEY && environment() !== 'local' && !navigator.webdriver;
}

export function track(event: string, props?: Props) {
  if (debug()) {
    const log = ((window as unknown as { __aduEvents?: unknown[] }).__aduEvents ??= []);
    log.push({ event, ...props });
    console.info('[telemetry]', event, props ?? '');
  }
  if (ph) ph.capture(event, props);
  else if (enabled()) queue.push([event, props]);
}

/** Starts telemetry after the page has rendered, so it never slows the first screen. */
export function initTelemetry() {
  if (started) return;
  started = true;
  if (urlParam('telemetry') === 'debug') storage()?.setItem(DEBUG_KEY, '1');
  const code = participant();
  // Which explanations people open is a good sign of what's unclear. One listener covers
  // every dropdown (<details>) on every page. It listens for clicks on the title rather than
  // 'toggle', which also fires for dropdowns that start open. Keyboard Enter/Space also click.
  document.addEventListener(
    'click',
    (e) => {
      const summary = (e.target as Element | null)?.closest?.('summary');
      const d = summary?.parentElement;
      if (!(d instanceof HTMLDetailsElement) || d.classList.contains('dev-info')) return;
      const title = (summary!.textContent ?? '').trim().slice(0, 80);
      // The click runs before the dropdown changes, so it is about to become !open.
      track('explainer_toggled', { title, open: !d.open, route: window.location.hash.split('?')[0].slice(1) || '/' });
    },
    true,
  );
  if (!enabled()) {
    queue = [];
    return;
  }
  const load = () =>
    import('posthog-js').then(({ default: posthog }) => {
      posthog.init(KEY!, {
        api_host: HOST,
        persistence: 'sessionStorage', // no cookies; forgotten when the tab closes
        person_profiles: 'identified_only', // anonymous events only
        capture_pageview: false, // hash routing: page views are sent by usePageViews()
        capture_pageleave: true,
        autocapture: true, // clicks, plus rage clicks and dead clicks ("stuck" signals)
        capture_dead_clicks: true,
        mask_all_text: true, // autocapture never records element text (could contain an address)
        respect_dnt: true,
        disable_surveys: true,
        save_referrer: true,
        disable_session_recording: true, // turned on below for study participants only
        session_recording: { maskAllInputs: true, maskTextSelector: `.${PRIVATE}` },
        before_send: (e) => {
          if (!e) return e;
          for (const k of ['$current_url', '$pathname', '$referrer', '$initial_current_url', '$initial_pathname'])
            if (typeof e.properties?.[k] === 'string') e.properties[k] = scrubUrl(e.properties[k]);
          if (e.$set_once)
            for (const k of Object.keys(e.$set_once)) if (typeof e.$set_once[k] === 'string') e.$set_once[k] = scrubUrl(e.$set_once[k]);
          return e;
        },
      });
      posthog.register({ environment: environment(), build: __BUILD_COMMIT__, study: !!code, ...(code ? { participant: code } : {}) });
      if (code) posthog.startSessionRecording();
      ph = posthog;
      for (const [event, props] of queue) posthog.capture(event, props);
      queue = [];
    });
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => void load(), { timeout: 3000 });
  else setTimeout(() => void load(), 1500);
}
