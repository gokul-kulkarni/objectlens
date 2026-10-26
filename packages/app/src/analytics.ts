/**
 * Cloudflare Web Analytics — page views only, no cookies.
 *
 * The beacon loads on the public site and nowhere else. The same bundle is served from 127.0.0.1
 * by the local Python package, often offline and often with sensitive data pasted in; it must
 * never phone home from there, so the check is on the exact production hostname rather than
 * "anything that isn't localhost".
 *
 * What the beacon sends is page-view metadata (path, referrer, browser, country, load timing).
 * It never sees what is pasted or opened: that stays in the page's memory and its Web Worker.
 */

/** Public by design: the token identifies the site to Cloudflare and ships in the page anyway. */
export const ANALYTICS_TOKEN = '699392f237d74c25b4b0bafa4649a2b2';

export const PRODUCTION_HOSTNAME = 'objectlens.gokulkulkarni.dev';

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

/** Whether to load the beacon here: only with a token, and only on the public site. */
export function shouldLoadAnalytics(hostname: string, token: string = ANALYTICS_TOKEN): boolean {
  return token !== '' && hostname === PRODUCTION_HOSTNAME;
}

/** Adds the beacon script once, when `shouldLoadAnalytics` allows it. */
export function loadAnalytics(
  hostname: string = window.location.hostname,
  token: string = ANALYTICS_TOKEN,
  doc: Document = document,
): boolean {
  if (!shouldLoadAnalytics(hostname, token)) return false;
  if (doc.querySelector(`script[src="${BEACON_SRC}"]`) !== null) return false;

  const script = doc.createElement('script');
  script.defer = true;
  script.src = BEACON_SRC;
  script.dataset.cfBeacon = JSON.stringify({ token, spa: true });
  doc.head.append(script);
  return true;
}
