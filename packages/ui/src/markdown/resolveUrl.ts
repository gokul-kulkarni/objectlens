/**
 * Turning what a user pastes — a repo link, a file link, a raw URL — into something fetchable,
 * plus the bases its relative links and images resolve against.
 *
 * GitHub gets special handling because it is where READMEs live and because its page URLs are
 * not the file: `github.com/o/r/blob/main/README.md` is an HTML page, and the Markdown is at
 * `raw.githubusercontent.com`. Both hosts allow cross-origin reads, which is what makes fetching
 * from a static page possible at all.
 */

/** A directory to resolve `./x` against, and a root to resolve `/x` against. */
export interface Base {
  readonly dir: string;
  readonly root: string;
}

export interface Bases {
  /** For `<a href>`: on GitHub, the human-readable blob pages. */
  readonly link: Base;
  /** For `<img src>`: on GitHub, the raw files. */
  readonly asset: Base;
}

export interface ResolvedSource {
  readonly fetchUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly bases: Bases;
  /** Short name for the loaded document, e.g. `owner/repo` or the file name. */
  readonly label: string;
}

export type ResolveResult =
  | { readonly ok: true; readonly source: ResolvedSource }
  | { readonly ok: false; readonly error: string };

const GITHUB_RAW_HEADERS = { Accept: 'application/vnd.github.raw' } as const;

export function resolveSource(input: string): ResolveResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a URL.' };

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That is not a valid URL.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http and https URLs can be loaded.' };
  }

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter((part) => part !== '').map(decodeURIComponent);

  if ((host === 'github.com' || host === 'www.github.com') && parts.length >= 2) return github(parts, url);
  if (host === 'raw.githubusercontent.com' && parts.length >= 4) return githubRaw(parts);
  return { ok: true, source: plain(url) };
}

function github(parts: readonly string[], url: URL): ResolveResult {
  const [owner, rawRepo, view, ref, ...rest] = parts as [string, string, ...string[]];
  const repo = rawRepo.replace(/\.git$/, '');
  const label = `${owner}/${repo}`;

  // `github.com/o/r` — the repo's README, whatever it is called and whichever branch is default.
  if (view === undefined) {
    return {
      ok: true,
      source: {
        fetchUrl: api(owner, repo, ''),
        headers: GITHUB_RAW_HEADERS,
        bases: repoBases(owner, repo, 'HEAD', ''),
        label,
      },
    };
  }

  if (ref === undefined) return { ok: false, error: 'That GitHub link does not point at a file or a folder.' };
  const path = rest.join('/');

  if (view === 'blob') {
    return {
      ok: true,
      source: {
        fetchUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encodePath(path)}`,
        headers: {},
        bases: repoBases(owner, repo, ref, dirname(path)),
        label: `${label}/${path}`,
      },
    };
  }

  if (view === 'tree') {
    const query = new URLSearchParams({ ref });
    return {
      ok: true,
      source: {
        fetchUrl: `${api(owner, repo, path)}?${query.toString()}`,
        headers: GITHUB_RAW_HEADERS,
        bases: repoBases(owner, repo, ref, path === '' ? '' : `${path}/`),
        label: path === '' ? label : `${label}/${path}`,
      },
    };
  }

  return { ok: true, source: plain(url) };
}

function githubRaw(parts: readonly string[]): ResolveResult {
  const [owner, repo, ref, ...rest] = parts as [string, string, string, ...string[]];
  const path = rest.join('/');
  return {
    ok: true,
    source: {
      fetchUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encodePath(path)}`,
      headers: {},
      bases: repoBases(owner, repo, ref, dirname(path)),
      label: `${owner}/${repo}/${path}`,
    },
  };
}

function plain(url: URL): ResolvedSource {
  const dir = new URL('.', url).toString();
  const root = `${url.origin}/`;
  const name = url.pathname.split('/').filter((part) => part !== '').pop() ?? url.host;
  return {
    fetchUrl: url.toString(),
    headers: {},
    bases: { link: { dir, root }, asset: { dir, root } },
    label: name,
  };
}

function api(owner: string, repo: string, dir: string): string {
  const suffix = dir === '' ? '' : `/${encodePath(dir)}`;
  return `https://api.github.com/repos/${owner}/${repo}/readme${suffix}`;
}

/** `dir` is relative to the repo root and either empty or ends with `/`. */
function repoBases(owner: string, repo: string, ref: string, dir: string): Bases {
  const linkRoot = `https://github.com/${owner}/${repo}/blob/${ref}/`;
  const assetRoot = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;
  return {
    link: { root: linkRoot, dir: `${linkRoot}${encodePath(dir)}` },
    asset: { root: assetRoot, dir: `${assetRoot}${encodePath(dir)}` },
  };
}

/** `docs/guide/intro.md` → `docs/guide/`; a root file → empty. */
function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash + 1);
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Resolves a link or image path from the document against `base`. Absolute URLs, protocol-
 * relative URLs, anchors and data URIs are left as they are; `/x` resolves against the root —
 * on GitHub, the repository root rather than the host.
 */
export function resolveRelative(href: string, base: Base): string {
  if (href === '' || href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return href;
  }
  try {
    return href.startsWith('/') ? new URL(href.slice(1), base.root).toString() : new URL(href, base.dir).toString();
  } catch {
    return href;
  }
}
