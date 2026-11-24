import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Footer, Header } from './components/ui';
import { SessionProvider } from './data/session';
import Details from './pages/Details';
import Find from './pages/Find';
import HaveASay from './pages/HaveASay';
import Landing from './pages/Landing';
import OptionLane from './pages/OptionLane';
import Overview from './pages/Overview';
import Paying from './pages/Paying';
import RulesPage from './pages/Rules';
import { NotPossible, Unsupported } from './pages/Status';
import './styles.css';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function App() {
  const { pathname } = useLocation();
  return (
    <>
      <ScrollTop />
      <Header />
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
      {pathname !== '/find' && <Footer />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing so deep links work on GitHub Pages without a 404 fallback. */}
    <HashRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </HashRouter>
  </StrictMode>,
);
