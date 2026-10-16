// What this browser can do with the YouTube decks.
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
// iPadOS reports itself as a Mac; touch support gives it away.
const ios =
  /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const android = /Android/i.test(ua);

export const device = {
  ios,
  android,
  mobile: ios || android,
  /** iOS ignores scripted volume on media, so crossfades are impossible there. */
  volumeControl: !ios,
};
