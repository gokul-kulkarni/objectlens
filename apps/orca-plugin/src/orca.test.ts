import { describe, expect, it, vi } from 'vitest';
import { openDocument, type EditorSession } from './orca.js';

describe('openDocument', () => {
  it('explains itself outside a custom editor', async () => {
    await expect(openDocument(undefined)).rejects.toThrow(/Orca custom editor/);
    await expect(openDocument({})).rejects.toThrow(/Orca custom editor/);
  });

  it('exposes the first text and each outside change', async () => {
    let replace: (value: string) => void = () => {};
    const session: EditorSession<string> = {
      value: '{"a": 1}',
      readOnly: false,
      onReplace: (handler) => {
        replace = handler;
        return { dispose: vi.fn() };
      },
      dispose: vi.fn(),
    };
    const feed = await openDocument({ document: { session: async <T,>() => session as EditorSession<T> } });

    const listener = vi.fn();
    feed.subscribe(listener);
    replace('{"a": 2}');

    expect(feed.text).toBe('{"a": 1}');
    expect(listener).toHaveBeenCalledWith('{"a": 2}');
  });
});
