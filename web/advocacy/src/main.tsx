import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Shared design tokens, fonts and base styles from the homeowner tool.
import '../../src/styles.css';
import './advocacy.css';
import { ErrorBoundary, markStarted } from '../../src/components/ErrorScreen';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
markStarted();
