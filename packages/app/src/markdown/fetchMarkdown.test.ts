import { describe, expect, it, vi } from 'vitest';
import { MAX_INPUT_BYTES } from '@objectlens/core';
import { fetchMarkdown } from './fetchMarkdown.js';
import type { ResolvedSource } from './resolveUrl.js';

const source: ResolvedSource = {
  fetchUrl: 'https://api.github.com/repos/o/r/readme',
  headers: { Accept: 'application/vnd.github.raw' },
  bases: { link: { dir: '', root: '' }, asset: { dir: '', root: '' } },
  label: 'o/r',
};

const respond = (body: string, init: ResponseInit = {}) => vi.fn(async () => new Response(body, init));

describe('fetchMarkdown', () => {
  it('returns the text and sends no credentials', async () => {
    const fetchImpl = respond('# Hi');
    await expect(fetchMarkdown(source, { fetchImpl })).resolves.toEqual({ ok: true, text: '# Hi' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(source.fetchUrl);
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual(source.headers);
  });

  it('explains a 404', async () => {
    const result = await fetchMarkdown(source, { fetchImpl: respond('', { status: 404 }) });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Not found') });
  });

  it('recognises GitHub rate limiting', async () => {
    const fetchImpl = respond('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    const result = await fetchMarkdown(source, { fetchImpl });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('rate limit') });
  });

  it('reports a plain 403 and other statuses', async () => {
    expect(await fetchMarkdown(source, { fetchImpl: respond('', { status: 403 }) })).toEqual({
      ok: false,
      error: 'The server refused the request (403).',
    });
    expect(await fetchMarkdown(source, { fetchImpl: respond('', { status: 500, statusText: 'Oops' }) })).toEqual({
      ok: false,
      error: 'The server answered 500 Oops.',
    });
  });

  it('refuses a document over the size limit by its declared length', async () => {
    const fetchImpl = respond('x', { headers: { 'content-length': String(MAX_INPUT_BYTES + 1) } });
    const result = await fetchMarkdown(source, { fetchImpl });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('larger than') });
  });

  it('turns a network failure into advice', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await fetchMarkdown(source, { fetchImpl });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('download the file and open it instead') });
  });

  it('times out', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const result = await fetchMarkdown(source, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 });
    expect(result).toEqual({ ok: false, error: 'The server took too long to respond.' });
  });

  it('reports cancellation by the caller', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = fetchMarkdown(source, { fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toEqual({ ok: false, error: 'Cancelled.' });
  });
});
