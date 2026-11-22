import { describe, expect, it } from 'vitest';
import { resolveRelative, resolveSource, type ResolvedSource } from './resolveUrl.js';

function resolved(input: string): ResolvedSource {
  const result = resolveSource(input);
  if (!result.ok) throw new Error(result.error);
  return result.source;
}

describe('resolveSource', () => {
  it('turns a repo link into the README API, which finds the file on any default branch', () => {
    const source = resolved('https://github.com/mermaid-js/mermaid');

    expect(source.fetchUrl).toBe('https://api.github.com/repos/mermaid-js/mermaid/readme');
    expect(source.headers).toEqual({ Accept: 'application/vnd.github.raw' });
    expect(source.label).toBe('mermaid-js/mermaid');
    expect(source.bases.asset.dir).toBe('https://raw.githubusercontent.com/mermaid-js/mermaid/HEAD/');
    expect(source.bases.link.dir).toBe('https://github.com/mermaid-js/mermaid/blob/HEAD/');
  });

  it('accepts a link without a scheme, and strips a .git suffix', () => {
    expect(resolved('github.com/o/r.git').fetchUrl).toBe('https://api.github.com/repos/o/r/readme');
  });

  it('maps a blob page to the raw file, with bases in its folder', () => {
    const source = resolved('https://github.com/o/r/blob/main/docs/guide/intro.md');

    expect(source.fetchUrl).toBe('https://raw.githubusercontent.com/o/r/main/docs/guide/intro.md');
    expect(source.headers).toEqual({});
    expect(source.bases.asset).toEqual({
      root: 'https://raw.githubusercontent.com/o/r/main/',
      dir: 'https://raw.githubusercontent.com/o/r/main/docs/guide/',
    });
    expect(source.bases.link.dir).toBe('https://github.com/o/r/blob/main/docs/guide/');
  });

  it('maps a tree page to the README of that folder at that ref', () => {
    const source = resolved('https://github.com/o/r/tree/v2/packages/core');
    expect(source.fetchUrl).toBe('https://api.github.com/repos/o/r/readme/packages/core?ref=v2');
    expect(source.bases.asset.dir).toBe('https://raw.githubusercontent.com/o/r/v2/packages/core/');
  });

  it('maps the root of a tree page to the repo README at that ref', () => {
    const source = resolved('https://github.com/o/r/tree/dev');
    expect(source.fetchUrl).toBe('https://api.github.com/repos/o/r/readme?ref=dev');
    expect(source.label).toBe('o/r');
  });

  it('keeps raw GitHub URLs, deriving bases from them', () => {
    const source = resolved('https://raw.githubusercontent.com/o/r/main/README.md');
    expect(source.fetchUrl).toBe('https://raw.githubusercontent.com/o/r/main/README.md');
    expect(source.bases.link.dir).toBe('https://github.com/o/r/blob/main/');
  });

  it('fetches any other URL as it is', () => {
    const source = resolved('https://example.com/docs/readme.md?x=1');
    expect(source.fetchUrl).toBe('https://example.com/docs/readme.md?x=1');
    expect(source.bases.asset).toEqual({ dir: 'https://example.com/docs/', root: 'https://example.com/' });
    expect(source.label).toBe('readme.md');
  });

  it('treats an unrecognised GitHub page as a plain URL', () => {
    expect(resolved('https://github.com/o/r/issues/1').fetchUrl).toBe('https://github.com/o/r/issues/1');
  });

  it('rejects a GitHub link that names no file', () => {
    expect(resolveSource('https://github.com/o/r/blob')).toEqual({
      ok: false,
      error: 'That GitHub link does not point at a file or a folder.',
    });
  });

  it.each([
    ['', 'Enter a URL.'],
    ['javascript:alert(1)', 'Only http and https URLs can be loaded.'],
    ['file:///etc/passwd', 'Only http and https URLs can be loaded.'],
    ['https://', 'That is not a valid URL.'],
  ])('rejects %j', (input, error) => {
    expect(resolveSource(input)).toEqual({ ok: false, error });
  });
});

describe('resolveRelative', () => {
  const base = { dir: 'https://h.example/repo/docs/', root: 'https://h.example/repo/' };

  it('resolves a relative path against the folder', () => {
    expect(resolveRelative('img/a.png', base)).toBe('https://h.example/repo/docs/img/a.png');
    expect(resolveRelative('../b.md', base)).toBe('https://h.example/repo/b.md');
  });

  it('resolves a root-relative path against the root, not the host', () => {
    expect(resolveRelative('/assets/logo.svg', base)).toBe('https://h.example/repo/assets/logo.svg');
  });

  it.each(['https://other.example/x', '//cdn.example/x', '#section', 'mailto:a@b.c', 'data:image/png;base64,AA', ''])(
    'leaves %j alone',
    (href) => {
      expect(resolveRelative(href, base)).toBe(href);
    },
  );
});
