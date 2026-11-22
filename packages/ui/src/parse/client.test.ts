import { describe, expect, it, vi } from 'vitest';
import { createParseClient } from './client.js';
import type { ParseEngineResponse, ParseRequest } from './protocol.js';

const request: ParseRequest = { type: 'parse', id: 1, adapterId: 'json', text: '{"a": 1}' };

function nextResponse(post: (onResponse: (response: ParseEngineResponse) => void) => void) {
  return new Promise<ParseEngineResponse>((resolve) => post(resolve));
}

/** A worker that only records what it is sent, so a test can drive its events by hand. */
class SilentWorker extends EventTarget {
  readonly sent: unknown[] = [];
  terminated = false;
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}

describe('createParseClient', () => {
  it('posts to the worker and relays its answers', async () => {
    const worker = new SilentWorker();
    const response = nextResponse((onResponse) => {
      const client = createParseClient(onResponse, () => worker as unknown as Worker);
      client.post(request);
      const data: ParseEngineResponse = { type: 'parse', id: 1, graph: null, diagnostics: [], elapsedMs: 0 };
      worker.dispatchEvent(new MessageEvent('message', { data }));
    });
    expect(worker.sent).toEqual([request]);
    expect((await response).id).toBe(1);
  });

  it('parses on the main thread when a worker cannot be created', async () => {
    const response = await nextResponse((onResponse) => {
      const client = createParseClient(onResponse, () => {
        throw new Error('workers are not allowed here');
      });
      client.post(request);
    });
    expect(response.type).toBe('parse');
    expect(response.type === 'parse' && response.graph?.nodesById.size).toBeGreaterThan(1);
  });

  it('replays the request in flight when the worker fails', async () => {
    const worker = new SilentWorker();
    const response = await nextResponse((onResponse) => {
      const client = createParseClient(onResponse, () => worker as unknown as Worker);
      client.post(request);
      worker.dispatchEvent(new Event('error'));
    });
    expect(worker.terminated).toBe(true);
    expect(response.id).toBe(1);
  });

  it('stays on the main thread after a worker failure', async () => {
    const worker = new SilentWorker();
    const onResponse = vi.fn();
    const client = createParseClient(onResponse, () => worker as unknown as Worker);
    worker.dispatchEvent(new Event('error'));
    client.post(request);
    await vi.waitFor(() => expect(onResponse).toHaveBeenCalledOnce());
    expect(worker.sent).toEqual([]);
  });

  it('drops answers after dispose', async () => {
    const onResponse = vi.fn();
    const client = createParseClient(onResponse, () => {
      throw new Error('no workers');
    });
    client.post(request);
    client.dispose();
    client.post(request);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onResponse).not.toHaveBeenCalled();
  });
});
