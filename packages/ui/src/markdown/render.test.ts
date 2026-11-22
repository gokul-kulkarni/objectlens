// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSlugger, renderMarkdown, type Segment } from './render.js';

const html = (segments: readonly Segment[]) =>
  segments.map((segment) => (segment.kind === 'html' ? segment.html : `[mermaid:${segment.source}]`)).join('');

describe('renderMarkdown', () => {
  it('renders GitHub-flavoured Markdown', () => {
    const { segments } = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~old~~');
    const out = html(segments);

    expect(out).toContain('<table>');
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('<del>old</del>');
  });

  it('splits top-level mermaid fences into their own segments, in order', () => {
    const { segments } = renderMarkdown('Intro\n\n```mermaid\ngraph TD; A-->B\n```\n\nOutro');

    expect(segments.map((segment) => segment.kind)).toEqual(['html', 'mermaid', 'html']);
    expect(segments[1]).toEqual({ kind: 'mermaid', source: 'graph TD; A-->B' });
  });

  it('keeps a mermaid fence nested in a list as source rather than dropping it', () => {
    const { segments } = renderMarkdown('- item\n\n  ```mermaid\n  graph TD; A-->B\n  ```');
    expect(segments.every((segment) => segment.kind === 'html')).toBe(true);
    expect(html(segments)).toContain('graph TD; A--&gt;B');
  });

  it('highlights code in known languages and escapes the rest', () => {
    const out = html(renderMarkdown('```python\ndef f(): pass\n```\n\n```nosuchlang\n<b>x</b>\n```').segments);

    expect(out).toContain('hljs-keyword');
    expect(out).toContain('data-lang="python"');
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('resolves reference-style links across segment boundaries', () => {
    const { segments } = renderMarkdown('See [docs].\n\n```mermaid\ngraph TD; A\n```\n\n[docs]: https://example.com');
    expect(html(segments)).toContain('href="https://example.com"');
  });

  it('strips script and event handlers from raw HTML', () => {
    const out = html(renderMarkdown('<img src="x.png" onerror="alert(1)"><script>alert(2)</script>[a](javascript:alert(3))').segments);

    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('javascript:');
  });

  it('collects headings with prefixed, de-duplicated GitHub slugs', () => {
    const { headings, segments } = renderMarkdown('# Intro\n\n## Set `up` & *run*\n\n## Intro');

    expect(headings).toEqual([
      { depth: 1, text: 'Intro', id: 'user-content-intro' },
      { depth: 2, text: 'Set up & run', id: 'user-content-set-up--run' },
      { depth: 2, text: 'Intro', id: 'user-content-intro-1' },
    ]);
    expect(html(segments)).toContain('<h2 id="user-content-set-up--run">');
  });

  it('points in-page anchors at the prefixed heading ids', () => {
    expect(html(renderMarkdown('[go](#intro)').segments)).toContain('href="#user-content-intro"');
  });

  it('opens external links in a new tab without leaking the opener', () => {
    const out = html(renderMarkdown('[x](https://example.com)').segments);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('resolves relative links and images, including raw HTML images, against the bases', () => {
    const bases = {
      link: { dir: 'https://github.com/o/r/blob/main/docs/', root: 'https://github.com/o/r/blob/main/' },
      asset: { dir: 'https://raw.example/o/r/main/docs/', root: 'https://raw.example/o/r/main/' },
    };
    const out = html(renderMarkdown('![a](img/a.png) <img src="/logo.svg"> [b](guide.md)', { bases }).segments);

    expect(out).toContain('src="https://raw.example/o/r/main/docs/img/a.png"');
    expect(out).toContain('src="https://raw.example/o/r/main/logo.svg"');
    expect(out).toContain('href="https://github.com/o/r/blob/main/docs/guide.md"');
  });

  it('leaves relative paths alone for a pasted document with no origin', () => {
    expect(html(renderMarkdown('![a](img/a.png)').segments)).toContain('src="img/a.png"');
  });

  it('renders nothing for empty input', () => {
    expect(renderMarkdown('')).toEqual({ segments: [], headings: [] });
  });
});

describe('createSlugger', () => {
  it('keeps letters from any script and numbers', () => {
    const slug = createSlugger();
    expect(slug('Café 2 — Ünïcode!')).toBe('café-2--ünïcode');
  });
});
