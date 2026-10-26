/**
 * One Mermaid diagram, with a toolbar to see its source, view it fullscreen, and take the SVG
 * away. Zoom and pan live in `DiagramCanvas`.
 *
 * A diagram that fails to parse shows Mermaid's error beside its source rather than breaking the
 * rest of the document — a README with one typo in a flowchart is still worth reading.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Spinner, WarningIcon } from '@objectlens/icons';
import { DiagramCanvas } from './DiagramCanvas.jsx';
import { renderDiagram, type DiagramResult } from './mermaid.js';

const TOOL_BUTTON =
  'flex cursor-pointer items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800';

export function MermaidDiagram({ source }: { readonly source: string }) {
  const [result, setResult] = useState<DiagramResult | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const figure = useRef<HTMLElement>(null);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === figure.current && figure.current !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement === figure.current) void document.exitFullscreen();
    else void figure.current?.requestFullscreen();
  };

  useEffect(() => {
    let current = true;
    setResult(null);
    void renderDiagram(source).then((next) => {
      // A newer source may have replaced this one while it rendered.
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [source]);

  const svg = result?.ok === true ? result.svg : null;

  const copySvg = () => {
    if (svg === null) return;
    void navigator.clipboard.writeText(svg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const downloadSvg = () => {
    if (svg === null) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diagram.svg';
    link.click();
    URL.revokeObjectURL(url);
  };

  const toolbar = (zoomControls: ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 px-2 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]">
        Mermaid
      </span>
      <span className="ml-auto" />
      {zoomControls}
      <button type="button" className={TOOL_BUTTON} aria-pressed={showSource} onClick={() => setShowSource((value) => !value)}>
        {showSource ? 'Diagram' : 'Source'}
      </button>
      <button type="button" className={TOOL_BUTTON} disabled={svg === null} onClick={copySvg} aria-label="Copy SVG">
        {copied ? <Check className="text-[color:var(--color-node-scalar)]" /> : <Copy />}
        SVG
      </button>
      <button type="button" className={TOOL_BUTTON} disabled={svg === null} onClick={downloadSvg} aria-label="Download SVG">
        <Download />
      </button>
      {document.fullscreenEnabled && (
        <button type="button" className={TOOL_BUTTON} disabled={svg === null} aria-pressed={fullscreen} onClick={toggleFullscreen}>
          {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      )}
    </div>
  );

  return (
    <figure
      ref={figure}
      className={`ol-diagram my-4 rounded border border-slate-800 ${fullscreen ? 'flex flex-col bg-slate-950' : 'bg-slate-950/60'}`}
    >
      {(svg === null || showSource) && toolbar(null)}

      {result === null && !showSource && (
        <div role="status" className="flex items-center gap-2 p-4 text-xs text-[color:var(--color-ink-subtle)]">
          <Spinner />
          Rendering diagram…
        </div>
      )}

      {result?.ok === false && (
        <p role="alert" className="flex items-start gap-1.5 px-3 pt-3 text-xs text-[color:var(--color-danger)]">
          <WarningIcon className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap font-mono">{result.error}</span>
        </p>
      )}

      {svg !== null && !showSource && <DiagramCanvas svg={svg} fullscreen={fullscreen} toolbar={toolbar} />}

      {(showSource || result?.ok === false) && (
        <pre className="m-0 overflow-auto p-3 font-mono text-xs text-[color:var(--color-ink-muted)]">{source}</pre>
      )}
    </figure>
  );
}
