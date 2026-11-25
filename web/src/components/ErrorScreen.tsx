import { Component, useEffect, useState, type ReactNode } from 'react';
import { track } from '../telemetry';

/** Build stamp injected by vite.config.ts (commit + build time), shown in Developer Info. */
export const BUILD = `${__BUILD_COMMIT__} · built ${__BUILD_TIME__}`;

/** Everything a developer needs to debug a report, as plain text people can copy and paste. */
export function developerInfo(error: unknown, componentStack?: string): string {
  const e = error instanceof Error ? error : new Error(String(error));
  return [
    `${e.name}: ${e.message}`,
    '',
    'Page:     ' + window.location.href,
    'Time:     ' + new Date().toISOString(),
    'Build:    ' + BUILD,
    'Browser:  ' + navigator.userAgent,
    '',
    'Stack:',
    e.stack ?? '(none)',
    ...(componentStack ? ['', 'Component stack:', componentStack.trim()] : []),
  ].join('\n');
}

/** A code file that failed to download (usually a network blip or a newer deploy). */
function isLoadError(error: unknown) {
  return /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(String(error));
}

export function ErrorScreen({ error, componentStack, homeHref }: { error: unknown; componentStack?: string; homeHref?: string }) {
  const info = developerInfo(error, componentStack);
  useEffect(() => {
    const e = error instanceof Error ? error : new Error(String(error));
    track('error_shown', { message: e.message.slice(0, 300), load_error: isLoadError(error), stack: (e.stack ?? '').slice(0, 1500) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(info).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  return (
    <main className="error-screen" role="alert">
      <h1>Something went wrong</h1>
      <p>
        {isLoadError(error)
          ? 'Part of the page didn’t download. This is usually a brief connection problem: reloading normally fixes it.'
          : 'This page hit an error and couldn’t be shown. Reloading usually fixes it. If it keeps happening, please send us the developer info below.'}
      </p>
      <div className="error-actions">
        <button className="btn primary" onClick={() => window.location.reload()}>
          Reload page
        </button>
        {homeHref && (
          <a
            className="btn"
            href={homeHref}
            onClick={(e) => {
              e.preventDefault();
              window.location.assign(homeHref);
              window.location.reload();
            }}
          >
            Go to the start
          </a>
        )}
      </div>
      <details className="exp dev-info">
        <summary>Developer Info</summary>
        <pre>{info}</pre>
        <button className="btn small" onClick={copy}>
          {copied ? 'Copied' : 'Copy to clipboard'}
        </button>
      </details>
    </main>
  );
}

/** Catches errors while React renders, so a crash shows the error screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; homeHref?: string }, { error?: unknown; componentStack?: string }> {
  state: { error?: unknown; componentStack?: string } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(_error: unknown, info: { componentStack?: string | null }) {
    this.setState({ componentStack: info.componentStack ?? undefined });
  }
  render() {
    if (this.state.error !== undefined)
      return <ErrorScreen error={this.state.error} componentStack={this.state.componentStack} homeHref={this.props.homeHref} />;
    return this.props.children;
  }
}

/** Tells the pre-start safety net in index.html (src/boot.js) that the app is running. */
export function markStarted() {
  (window as unknown as { __appStarted?: boolean }).__appStarted = true;
}
