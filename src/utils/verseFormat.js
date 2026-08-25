/**
 * Build a compact verse range string from a sorted array of verses.
 * Examples:
 *   "Genesis 6:9\u20136:13"       (same book+chapter)
 *   "Genesis 6:9 \u2013 7:2"     (same book, different chapters)
 *   "Genesis 6:9 \u2013 Exodus 1:1" (different books)
 *   "Genesis 6:9"                (single verse)
 *
 * Falls back to empty string if no references exist.
 *
 * Shared by LogSessionPage.jsx (verse-selection summary) and
 * Dashboard.jsx (permanent range label above each reading's verse grid).
 */
export function formatVerseRange(verses) {
  if (!verses || verses.length === 0) return '';

  const first = verses[0]?.verse_reference;
  const last = verses[verses.length - 1]?.verse_reference;

  if (!first) return '';
  if (!last || first === last || verses.length === 1) return first;

  // Try to condense: "Genesis 6:9" and "Genesis 6:13" → "Genesis 6:9–6:13"
  // Parse "Book Chapter:Verse" — book name may contain spaces (e.g., "1 Samuel")
  const parseRef = (ref) => {
    const match = ref.match(/^(.+)\s+(\d+):(\d+)$/);
    if (!match) return null;
    return { book: match[1], chapter: match[2], verse: match[3] };
  };

  const f = parseRef(first);
  const l = parseRef(last);

  if (!f || !l) {
    // Unparseable: show both with en-dash
    return `${first} \u2013 ${last}`;
  }

  if (f.book === l.book && f.chapter === l.chapter) {
    // Same book and chapter: "Genesis 6:9–6:13"
    return `${first}\u2013${l.chapter}:${l.verse}`;
  }

  if (f.book === l.book) {
    // Same book, different chapters: "Genesis 6:9 – 7:2"
    return `${first} \u2013 ${l.chapter}:${l.verse}`;
  }

  // Different books: show both fully
  return `${first} \u2013 ${last}`;
}
