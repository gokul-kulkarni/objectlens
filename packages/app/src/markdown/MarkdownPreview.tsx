/**
 * The rendered document.
 *
 * HTML segments are already sanitised by `renderMarkdown`; Mermaid segments become components.
 * In-page anchor links are handled here rather than by the browser, because the URL hash already
 * belongs to the mode switcher — following `#install` natively would switch modes.
 */

import type { MouseEvent } from 'react';
import 'highlight.js/styles/github-dark.css';
import { MermaidDiagram } from './MermaidDiagram.jsx';
import type { Segment } from './render.js';

export interface MarkdownPreviewProps {
  readonly segments: readonly Segment[];
  readonly onNavigate: (id: string) => void;
}

export function MarkdownPreview({ segments, onNavigate }: MarkdownPreviewProps) {
  const onClick = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as Element).closest('a');
    const href = link?.getAttribute('href');
    if (href === null || href === undefined || !href.startsWith('#')) return;
    event.preventDefault();
    onNavigate(decodeURIComponent(href.slice(1)));
  };

  return (
    <article className="ol-markdown mx-auto max-w-3xl px-6 py-6" onClick={onClick}>
      {segments.map((segment, index) =>
        segment.kind === 'mermaid' ? (
          <MermaidDiagram key={`mermaid-${index}`} source={segment.source} />
        ) : (
          <div key={`html-${index}`} dangerouslySetInnerHTML={{ __html: segment.html }} />
        ),
      )}
    </article>
  );
}
