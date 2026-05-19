/**
 * @fileoverview Web Worker for MMM-FireflyBills bill parsing.
 *
 * Runs in a dedicated worker thread so the main thread is not blocked by
 * parseBills, sort, or JSON.stringify diffing. The main thread only does
 * the final DOM update when the parsed payload actually changed.
 *
 * Protocol:
 *   Main → Worker : { raw, config, lang, ts }
 *   Worker → Main : { unchanged: true } OR { parsed: ParsedBill[] }
 */

/* eslint-disable no-undef */

importScripts(
  "../node_modules/moment/min/moment-with-locales.js",
  "../node_modules/fast-sort/dist/sort.js",
  "./billParser.js"
);

let lastSerialized = null;

self.onmessage = (e) => {
  const { raw, config, lang, ts } = e.data || {};
  if (!Array.isArray(raw)) {
    self.postMessage({ unchanged: true });
    return;
  }
  if (lang && typeof moment.locale === "function") {
    moment.locale(lang);
  }
  const now = moment(ts || Date.now());
  let parsed;
  try {
    parsed = BillParser.parseBills(raw, now, config || {});
  } catch (err) {
    self.postMessage({ error: String(err && err.message ? err.message : err) });
    return;
  }
  const serialized = JSON.stringify(parsed);
  if (serialized === lastSerialized) {
    self.postMessage({ unchanged: true });
    return;
  }
  lastSerialized = serialized;
  self.postMessage({ parsed });
};
