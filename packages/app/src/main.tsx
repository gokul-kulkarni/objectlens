import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { loadAnalytics } from './analytics.js';
import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Page-view analytics, on the public site only — see analytics.ts.
loadAnalytics();
