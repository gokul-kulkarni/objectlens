/**
 * Fetching a Markdown document — the one action in ObjectLens that contacts the network, and
 * only ever when the user asks for it.
 *
 * Read-only and credential-free: nothing about the user or their other input is sent, and the
 * request carries no cookies. Failures come back as messages a reader can act on, not as thrown
 * errors; "CORS" in particular means nothing to most people.
 */

import { MAX_INPUT_BYTES } from '@objectlens/core';
import type { ResolvedSource } from './resolveUrl.js';

export type FetchResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string };

const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** Injected for tests. */
  readonly fetchImpl?: typeof fetch;
}

export async function fetchMarkdown(source: ResolvedSource, options: FetchOptions = {}): Promise<FetchResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetchImpl(source.fetchUrl, {
      headers: source.headers,
      credentials: 'omit',
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, error: describeStatus(response) };

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > MAX_INPUT_BYTES) return { ok: false, error: tooLarge(declared) };

    const text = await response.text();
    if (text.length > MAX_INPUT_BYTES) return { ok: false, error: tooLarge(text.length) };
    return { ok: true, text };
  } catch (error) {
    if (options.signal?.aborted === true) return { ok: false, error: 'Cancelled.' };
    if (controller.signal.aborted) return { ok: false, error: 'The server took too long to respond.' };
    return {
      ok: false,
      error:
        'Could not reach that URL. The server may be down, or it may not allow pages on other sites to read it' +
        ` — download the file and open it instead.${error instanceof Error && error.message !== '' ? ` (${error.message})` : ''}`,
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

function describeStatus(response: Response): string {
  if (response.status === 404) return 'Not found. Check the URL — private repositories cannot be loaded.';
  if ((response.status === 403 || response.status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
    return 'GitHub’s rate limit for anonymous requests is used up. Try again in a few minutes, or paste a file link.';
  }
  if (response.status === 403) return 'The server refused the request (403).';
  return `The server answered ${response.status}${response.statusText === '' ? '' : ` ${response.statusText}`}.`;
}

function tooLarge(bytes: number): string {
  return `That document is ${(bytes / 1_048_576).toFixed(1)} MB — larger than the ${Math.round(
    MAX_INPUT_BYTES / 1_048_576,
  )} MB limit.`;
}
