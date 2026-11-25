import { lazy, StrictMode, Suspense, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { ErrorBoundary, markStarted } from './components/ErrorScreen';
import { Footer, Header } from './components/ui';
import { SessionProvider } from './data/session';
import Landing from './pages/Landing';
import { initTelemetry, track } from './telemetry';
import './styles.css';

// Each page's code is downloaded only when it is opened (the landing page ships
// with the app so the first screen needs no extra request). The map library
// in particular is only fetched by the Find page.
const Find = lazy(() => import('./pages/Find'));
const Details = lazy(() => import('./pages/Details'));
const Overview = lazy(() => import('./pages/Overview'));
const OptionLane = lazy(() => import('./pages/OptionLane'));
const Paying = lazy(() => import('./pages/Paying'));
const RulesPage = lazy(() => import('./pages/Rules'));
const HaveASay = lazy(() => import('./pages/HaveASay'));
const NotPossible = lazy(() => import('./pages/Status').then((m) => ({ default: m.NotPossible })));
const Unsupported = lazy(() => import('./pages/Status').then((m) => ({ default: m.Unsupported })));

function ScrollTop() {
  const { pathname } = useLocation();
  // Braces matter: an effect may only return a cleanup function. Newer Chrome (~157+)
  // makes window.scrollTo return a Promise, which React then tried to call as the
  // cleanup on the next page change: "TypeError: n is not a function".
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** A page view for each route (hash routing, so PostHog can't see these itself), and "went back" as a stuck signal. */
function PageViews() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  // The pages visited in this tab. Browser Back, Forward and editing the URL all arrive as
  // POP, so "went back" only counts when the new page is the one just before.
  const history = useRef<string[]>([]);
  useEffect(() => {
    // Route only, e.g. /option/garage/questions. The URL is sent too, with the lot ID stripped (see telemetry.ts).
    track('$pageview', { route: pathname });
    const h = history.current;
    if (navType === 'POP' && h.length >= 2 && h[h.length - 2] === pathname) {
      track('navigated_back', { from: h.pop()!, to: pathname });
    } else if (navType === 'REPLACE' && h.length) {
      h[h.length - 1] = pathname;
    } else if (h[h.length - 1] !== pathname) {
      h.push(pathname);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function App() {
  const { pathname } = useLocation();
  return (
    <>
      <ScrollTop />
      <PageViews />
      <Header />
      <Suspense fallback={<div className="page-loading" aria-live="polite">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/find" element={<Find />} />
          <Route path="/details" element={<Details />} />
          <Route path="/options" element={<Overview />} />
          <Route path="/option/:id" element={<OptionLane />} />
          <Route path="/option/:id/:step" element={<OptionLane />} />
          <Route path="/not-possible" element={<NotPossible />} />
          <Route path="/unsupported" element={<Unsupported />} />
          <Route path="/paying" element={<Paying />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/have-a-say" element={<HaveASay />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
      {pathname !== '/find' && <Footer />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing so deep links work on GitHub Pages without a 404 fallback. */}
    <ErrorBoundary homeHref="#/">
      <HashRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);
markStarted();
initTelemetry();
