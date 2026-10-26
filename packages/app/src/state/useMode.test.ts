// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { modeFromHash, useMode } from './useMode.js';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('modeFromHash', () => {
  it.each([
    ['', 'explore'],
    ['#compare', 'compare'],
    ['#markdown', 'markdown'],
    ['#nonsense', 'explore'],
    ['compare', 'compare'],
  ])('%j → %s', (hash, mode) => {
    expect(modeFromHash(hash)).toBe(mode);
  });
});

describe('useMode', () => {
  it('starts from the URL hash', () => {
    window.history.replaceState(null, '', '/#markdown');
    expect(renderHook(() => useMode()).result.current.mode).toBe('markdown');
  });

  it('writes the mode to the hash, and clears it for the default', () => {
    const { result } = renderHook(() => useMode());

    act(() => result.current.setMode('compare'));
    expect(result.current.mode).toBe('compare');
    expect(window.location.hash).toBe('#compare');

    act(() => result.current.setMode('explore'));
    expect(window.location.hash).toBe('');
  });

  it('follows the hash when it changes from outside, e.g. the back button', () => {
    const { result } = renderHook(() => useMode());

    act(() => {
      window.history.replaceState(null, '', '/#compare');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.mode).toBe('compare');
  });
});
