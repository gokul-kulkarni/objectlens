import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorApp } from './EditorApp.jsx';
import { openDocument, type OrcaFrameApi } from './orca.js';
import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');
const root = createRoot(container);

try {
  const feed = await openDocument((globalThis as { orca?: OrcaFrameApi }).orca);
  root.render(
    <StrictMode>
      <EditorApp feed={feed} />
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'ObjectLens could not open this file.';
  root.render(
    <p role="alert" className="p-6 text-sm text-[color:var(--color-danger)]">
      {message}
    </p>,
  );
}
