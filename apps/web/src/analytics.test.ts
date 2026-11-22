// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { loadAnalytics, PRODUCTION_HOSTNAME, shouldLoadAnalytics } from './analytics.js';

const beacons = () => document.querySelectorAll('script[src*="cloudflareinsights"]');

afterEach(() => beacons().forEach((script) => script.remove()));

describe('shouldLoadAnalytics', () => {
  it('loads only on the public site, with a token', () => {
    expect(shouldLoadAnalytics(PRODUCTION_HOSTNAME, 'abc')).toBe(true);
  });

  it('never loads from the local package, a preview, or a lookalike host', () => {
    for (const host of ['127.0.0.1', 'localhost', 'gokul-kulkarni.github.io', 'objectlens.gokulkulkarni.dev.evil.example']) {
      expect(shouldLoadAnalytics(host, 'abc')).toBe(false);
    }
  });

  it('stays off without a token, even on the public site', () => {
    expect(shouldLoadAnalytics(PRODUCTION_HOSTNAME, '')).toBe(false);
  });
});

describe('loadAnalytics', () => {
  it('does nothing in this test page, which is not the public site', () => {
    expect(loadAnalytics(window.location.hostname, 'abc')).toBe(false);
    expect(beacons()).toHaveLength(0);
  });

  it('adds the beacon once, deferred, with the token and SPA tracking', () => {
    const doc = document.implementation.createHTMLDocument('x');

    expect(loadAnalytics(PRODUCTION_HOSTNAME, 'abc', doc)).toBe(true);
    expect(loadAnalytics(PRODUCTION_HOSTNAME, 'abc', doc)).toBe(false);

    const scripts = doc.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.defer).toBe(true);
    expect(script.src).toBe('https://static.cloudflareinsights.com/beacon.min.js');
    expect(JSON.parse(script.dataset.cfBeacon ?? '')).toEqual({ token: 'abc', spa: true });
  });
});
