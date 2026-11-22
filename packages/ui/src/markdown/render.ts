/**
 * Markdown → sanitised HTML segments.
 *
 * The output is a list of segments rather than one HTML string: top-level ```mermaid fences come
 * out as their own `mermaid` segments, so the preview can render each diagram as a component with
 * its own state and toolbar instead of patching SVG into a blob of `innerHTML` after the fact.
 *
 * Everything that reaches the DOM passes through DOMPurify. A README fetched from the internet is
 * untrusted HTML, and Markdown allows raw HTML inline.
 */

import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { Marked, type Token, type Tokens, type TokensList } from 'marked';
import { resolveRelative, type Bases } from './resolveUrl.js';

export type Segment =
  | { readonly kind: 'html'; readonly html: string }
  | { readonly kind: 'mermaid'; readonly source: string };

export interface Heading {
  readonly depth: number;
  readonly text: string;
  readonly id: string;
}

export interface RenderedMarkdown {
  readonly segments: readonly Segment[];
  readonly headings: readonly Heading[];
}

export interface RenderOptions {
  /** Where relative links and images point, for a document fetched from a URL. */
  readonly bases?: Bases;
}

const MERMAID_LANGS = new Set(['mermaid', 'mmd']);

/** Prefixed like GitHub's, so a heading called "location" cannot clobber `document.location`. */
export const HEADING_ID_PREFIX = 'user-content-';

export function renderMarkdown(text: string, options: RenderOptions = {}): RenderedMarkdown {
  const headings: Heading[] = [];
  const slugs = createSlugger();
  const marked = createMarked(headings, slugs);

  const tokens = marked.lexer(text);
  const segments: Segment[] = [];
  let pending: Token[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    // The parser resolves reference-style links through `links`, so every slice must carry it.
    const slice = Object.assign([...pending], { links: tokens.links }) as TokensList;
    segments.push({ kind: 'html', html: sanitise(marked.parser(slice), options.bases) });
    pending = [];
  };

  for (const token of tokens) {
    if (token.type === 'code' && MERMAID_LANGS.has(languageOf(token as Tokens.Code))) {
      flush();
      segments.push({ kind: 'mermaid', source: (token as Tokens.Code).text });
    } else {
      pending.push(token);
    }
  }
  flush();

  return { segments, headings };
}

function createMarked(headings: Heading[], slugs: (text: string) => string): Marked {
  return new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        const plain = plainText(text);
        const id = `${HEADING_ID_PREFIX}${slugs(plain)}`;
        headings.push({ depth, text: plain, id });
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const language = languageOf({ lang } as Tokens.Code);
        // A mermaid fence nested in a list or quote is not a top-level segment; show its source.
        const highlighted =
          language !== '' && hljs.getLanguage(language) !== undefined
            ? hljs.highlight(text, { language, ignoreIllegals: true }).value
            : escapeHtml(text);
        const label = language === '' ? '' : ` data-lang="${escapeHtml(language)}"`;
        return `<pre${label}><code class="hljs">${highlighted}</code></pre>\n`;
      },
    },
  });
}

function languageOf(token: Pick<Tokens.Code, 'lang'>): string {
  return (token.lang ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/**
 * Sanitises one segment's HTML, then points relative links and images at their source and
 * opens external links in a new tab. Rewriting after sanitising means raw `<img src>` tags in a
 * README are fixed up too, not only Markdown image syntax.
 */
function sanitise(html: string, bases: Bases | undefined): string {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ADD_ATTR: ['target'],
  });

  for (const image of fragment.querySelectorAll<HTMLImageElement>('img[src]')) {
    const src = image.getAttribute('src') ?? '';
    if (bases !== undefined) image.setAttribute('src', resolveRelative(src, bases.asset));
    image.setAttribute('loading', 'lazy');
  }

  for (const link of fragment.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      // In-page anchors point at prefixed heading ids.
      link.setAttribute('href', `#${HEADING_ID_PREFIX}${href.slice(1)}`);
      continue;
    }
    const resolved = bases === undefined ? href : resolveRelative(href, bases.link);
    link.setAttribute('href', resolved);
    if (/^https?:/i.test(resolved)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }

  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

/** GitHub-style heading slugs: lower case, punctuation dropped, spaces to dashes, de-duplicated. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

/** Heading text without inline Markdown — what the outline and the slug are built from. */
function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
