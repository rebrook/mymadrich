/**
 * Hebcal utility for MyMadrich.
 *
 * Wraps @hebcal/core, @hebcal/leyning, and @hebcal/triennial to provide:
 *   - Date-to-parashah lookup (Shabbat)
 *   - Date-to-leyning resolution (Shabbat, holiday, weekday)
 *   - Aliyah breakdown with verse ranges (full kriyah and triennial)
 *   - Individual verse expansion from ranges
 *   - Sefaria URL construction
 *
 * Triennial is the default for student prep at Chizuk Amuno.
 * Full kriyah (parseAliyot) is retained for admin reference AND for
 * holiday/weekday readings, which are always full (never triennial).
 */

import { HebrewCalendar, HDate, ParshaEvent } from '@hebcal/core';
import { getLeyningForParshaHaShavua, getLeyningOnDate } from '@hebcal/leyning';
import { getTriennialForParshaHaShavua } from '@hebcal/triennial';

// ============================================================
// Verse counts per chapter for Torah and common Haftarah books
// ============================================================

const VERSE_COUNTS = {
  'Genesis': [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  'Exodus': [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  'Leviticus': [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],
  'Numbers': [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  'Deuteronomy': [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  'Joshua': [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  'Judges': [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  'I Samuel': [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,43,15,23,28,23,44,25,12,25,11,31,13],
  'II Samuel': [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  'I Kings': [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  'II Kings': [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
  'Isaiah': [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
  'Jeremiah': [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
  'Ezekiel': [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
  'Hosea': [11,23,5,19,15,11,16,14,17,15,12,14,16,9],
  'Joel': [20,32,21],
  'Amos': [15,16,15,13,27,14,17,14,15],
  'Obadiah': [21],
  'Jonah': [17,10,11,11],
  'Micah': [16,13,12,13,15,16,20],
  'Nahum': [15,14,19],
  'Habakkuk': [17,20,19],
  'Zephaniah': [18,15,20],
  'Haggai': [15,23],
  'Zechariah': [21,13,10,14,11,15,14,23,17,12,17,14,9,21],
  'Malachi': [14,17,18,6],
};

// Book names available for verse expansion (constrained dropdown in override UI)
// Torah books first, then Nevi'im in canonical order.
export const BOOK_NAMES = Object.keys(VERSE_COUNTS);

// Aliyah number to Hebrew name mapping
const ALIYAH_NAMES = {
  '1': 'Rishon',
  '2': 'Sheni',
  '3': 'Shlishi',
  '4': 'Revi\'i',
  '5': 'Chamishi',
  '6': 'Shishi',
  '7': 'Shvi\'i',
  'M': 'Maftir',
};

/**
 * Look up the parashah and leyning for a given date.
 *
 * @param {string} dateStr - ISO date string (e.g., "2027-01-16")
 * @returns {{ parsha, leyning, event, error }}
 */
export function getParashahForDate(dateStr) {
  try {
    const date = new Date(dateStr + 'T12:00:00');
    const hd = new HDate(date);

    // Find the Shabbat on or after this date
    const dow = hd.getDay();
    let shabbatHd = hd;
    if (dow !== 6) {
      // Advance to next Saturday (day 6)
      const daysUntilShabbat = (6 - dow + 7) % 7 || 7;
      shabbatHd = new HDate(hd.abs() + daysUntilShabbat);
    }

    // Get events for that Shabbat
    const events = HebrewCalendar.calendar({
      start: shabbatHd,
      end: shabbatHd,
      sedrot: true,
      noHolidays: false,
      il: false, // diaspora
    });

    // Find the parsha event
    const parshaEvent = events.find(
      (ev) => ev instanceof ParshaEvent || ev.getDesc().startsWith('Parashat')
    );

    if (!parshaEvent) {
      // This Shabbat might be a holiday that overrides the regular parashah
      const holidayEvents = events.filter((ev) => ev.getDesc());
      return {
        parsha: null,
        parshaHebrew: null,
        leyning: null,
        event: null,
        shabbatDate: shabbatHd.greg().toISOString().split('T')[0],
        holidayNote: holidayEvents.length > 0
          ? `This Shabbat is ${holidayEvents[0].getDesc()}. No regular parashah reading.`
          : 'No parashah found for this date.',
        error: null,
      };
    }

    // Get the leyning details
    const leyning = getLeyningForParshaHaShavua(parshaEvent, false);

    // Extract Hebrew parsha name (e.g., "וַיֵּרָא") from the event
    let parshaHebrew = null;
    try {
      const heDesc = parshaEvent.render('he');
      parshaHebrew = heDesc.replace(/^פרשת\s+/, '');
    } catch (e) {
      // Hebrew name unavailable; leave null
    }

    return {
      parsha: parshaEvent.getDesc().replace('Parashat ', ''),
      parshaHebrew,
      leyning,
      event: parshaEvent,
      shabbatDate: shabbatHd.greg().toISOString().split('T')[0],
      holidayNote: null,
      error: null,
    };
  } catch (err) {
    return {
      parsha: null,
      parshaHebrew: null,
      leyning: null,
      event: null,
      shabbatDate: null,
      holidayNote: null,
      error: err.message,
    };
  }
}

/**
 * Parse a leyning object into a structured array of aliyot.
 *
 * Reads from whichever aliyot property is present:
 *   - reading.fullkriyah  (Shabbat and holiday readings: up to 7 aliyot + Maftir)
 *   - reading.weekday     (weekday readings: 3 aliyot, no Maftir)
 *
 * Aliyah counts vary by occasion:
 *   - Regular Shabbat: 7 + M (keys 1-7, M)
 *   - Major holiday on Shabbat: 7 + M
 *   - Major holiday on weekday: 5 + M (keys 1-5, M)
 *   - Chol ha-Moed / Rosh Chodesh: 4 (keys 1-4)
 *   - Mon/Thu weekday: 3 (keys 1-3)
 *
 * This unified approach avoids duplicate parsing logic. Triennial
 * congregations should use parseTriennialAliyot() for regular Shabbat
 * student prep; this function handles full kriyah, holiday, and weekday.
 *
 * @param {object} leyning - A leyning result (from getLeyningForParshaHaShavua
 *                           or from a resolveReadingsForDate candidate)
 * @returns {Array<{ number, name, book, beginRef, endRef, verseCount }>}
 */
export function parseAliyot(leyning) {
  // Pick whichever aliyot object is present: weekday (3 aliyot) or fullkriyah (up to 7+M)
  const aliyotData = leyning?.weekday || leyning?.fullkriyah;
  if (!aliyotData) return [];

  const aliyot = [];
  for (const [num, info] of Object.entries(aliyotData)) {
    if (!info) continue;
    aliyot.push({
      number: num,
      name: ALIYAH_NAMES[num] || `Aliyah ${num}`,
      book: info.k,
      beginRef: info.b,
      endRef: info.e,
      verseCount: info.v || 0,
    });
  }
  return aliyot;
}

/**
 * Parse triennial aliyot from a ParshaEvent, returning the same shape
 * as parseAliyot() so downstream code needs zero changes.
 *
 * The cycle year (1, 2, or 3) is resolved automatically from the event's
 * Hebrew date by @hebcal/triennial. Pass the event for the student's
 * actual bimah Shabbat, not the current date.
 *
 * The triennial return structure from getTriennialForParshaHaShavua():
 *   {
 *     aliyot: { '1': {k,b,e,v}, '2': ..., '7': ..., 'M': ... },
 *     date: { yy, mm, dd, rd },
 *     variation: "Y.1" | "Y.2" | "Y.3",
 *     yearNum: 0 | 1 | 2,          // zero-indexed cycle year
 *     haft: { k, b, e, v, note },   // triennial haftarah (not used)
 *     haftara: "Isaiah 54:1-10",    // triennial haftarah string
 *     haftaraNumV: 10               // triennial haftarah verse count
 *   }
 *
 * We read from triReading.aliyot (the nested object), not the top level.
 * Each aliyah uses the same {k,b,e,v} shape as fullkriyah.
 *
 * Note: triennial maftir content differs from full kriyah. In triennial,
 * the maftir is typically the closing verses of that year's triennial
 * Torah portion. This mapping handles it identically since the aliyah
 * object shape is the same; only the verse ranges differ.
 *
 * IMPORTANT: Triennial applies ONLY to regular Shabbat parshiyot.
 * Holiday and weekday readings are fixed full readings and must use
 * parseAliyot() instead. The occasion classifier enforces this boundary:
 *   occasion === 'shabbat' → parseTriennialAliyot (via ParshaEvent)
 *   occasion === 'holiday' or 'weekday' → parseAliyot (full kriyah)
 *
 * @param {Event} event - A ParshaEvent from HebrewCalendar
 * @returns {Array<{ number, name, book, beginRef, endRef, verseCount }>}
 */
export function parseTriennialAliyot(event) {
  if (!event) return [];

  const triReading = getTriennialForParshaHaShavua(event);
  if (!triReading) return [];

  // The triennial return nests Torah aliyot inside triReading.aliyot
  // (keyed '1' through '7' plus 'M'), with metadata (date, variation,
  // yearNum, haft, haftara, haftaraNumV) at the top level.
  const aliyotData = triReading.aliyot;
  if (!aliyotData) return [];

  const aliyot = [];
  for (const [num, info] of Object.entries(aliyotData)) {
    if (!info) continue;
    aliyot.push({
      number: num,
      name: ALIYAH_NAMES[num] || `Aliyah ${num}`,
      book: info.k,
      beginRef: info.b,
      endRef: info.e,
      verseCount: info.v || 0,
    });
  }
  return aliyot;
}

/**
 * Compute the triennial cycle year (1, 2, or 3) for a given ParshaEvent.
 *
 * Uses the authoritative yearNum from @hebcal/triennial directly.
 * The package returns yearNum as zero-indexed (0, 1, 2); we add 1
 * for the human-readable label (Year 1, Year 2, Year 3).
 *
 * Confirmed: yearNum=1 + variation="Y.2" for Noach 5787 = Year 2.
 *
 * @param {Event} event - A ParshaEvent from HebrewCalendar
 * @returns {number|null} 1, 2, or 3 (null if unavailable)
 */
export function getTriennialCycleYear(event) {
  if (!event) return null;
  const triReading = getTriennialForParshaHaShavua(event);
  if (!triReading || triReading.yearNum == null) return null;
  return triReading.yearNum + 1;
}

/**
 * Parse the Haftarah reference from the leyning object.
 *
 * Triennial congregations typically use the standard (full kriyah)
 * haftarah, not a triennial-specific alternate. This function returns
 * the standard haftarah. Per-student exceptions are handled by the
 * admin override flow (Commit 2).
 *
 * @param {object} leyning - From getLeyningForParshaHaShavua
 * @returns {{ ashkenazi: string, sephardi: string|null }}
 */
export function parseHaftarah(leyning) {
  if (!leyning) return { ashkenazi: null, sephardi: null };

  return {
    ashkenazi: leyning.haftara || null,
    sephardi: leyning.sephpiHaftara || leyning.spiHaftara || null,
  };
}

/**
 * Expand a verse range into individual verse references.
 *
 * @param {string} book - Book name (e.g., "Exodus")
 * @param {string} beginRef - Start ref (e.g., "1:1")
 * @param {string} endRef - End ref (e.g., "1:7" or "2:3")
 * @returns {Array<{ reference, sefariaUrl }>}
 */
export function expandVerseRange(book, beginRef, endRef) {
  const [startChap, startVerse] = beginRef.split(':').map(Number);
  const [endChap, endVerse] = endRef.split(':').map(Number);

  const bookVerses = VERSE_COUNTS[book];
  const verses = [];

  if (!bookVerses) {
    // Unknown book; create a single entry for the full range
    const ref = `${book} ${beginRef}-${endRef}`;
    return [{
      reference: ref,
      sefariaUrl: buildSefariaUrl(book, beginRef, endRef),
    }];
  }

  for (let chap = startChap; chap <= endChap; chap++) {
    const firstVerse = chap === startChap ? startVerse : 1;
    const lastVerse = chap === endChap ? endVerse : (bookVerses[chap - 1] || 50);

    for (let v = firstVerse; v <= lastVerse; v++) {
      const ref = `${book} ${chap}:${v}`;
      verses.push({
        reference: ref,
        sefariaUrl: buildSefariaUrl(book, `${chap}:${v}`),
      });
    }
  }

  return verses;
}

/**
 * Build a Sefaria URL for a reference.
 *
 * @param {string} book - Book name
 * @param {string} startRef - e.g., "1:1"
 * @param {string} endRef - optional, e.g., "1:7"
 * @returns {string}
 */
export function buildSefariaUrl(book, startRef, endRef) {
  // Sefaria uses dots instead of colons and spaces
  const bookSlug = book.replace(/ /g, '_');
  const start = startRef.replace(':', '.');
  if (endRef) {
    const end = endRef.replace(':', '.');
    return `https://www.sefaria.org/${bookSlug}.${start}-${end}`;
  }
  return `https://www.sefaria.org/${bookSlug}.${start}`;
}

/**
 * Build the full reference string for a reading.
 *
 * @param {string} book - Book name (e.g., "Exodus")
 * @param {string} beginRef - e.g., "1:1"
 * @param {string} endRef - e.g., "1:7"
 * @returns {string} e.g., "Exodus 1:1-1:7"
 */
export function buildReferenceString(book, beginRef, endRef) {
  return `${book} ${beginRef}-${endRef}`;
}

/**
 * Parse a single "Book chapter:verse-chapter:verse" range token into
 * { book, beginRef, endRef }. If the token has no book prefix, the
 * provided fallbackBook is used (for bare continuation ranges like
 * "9:5-9:6" after a semicolon or comma).
 *
 * @param {string} token     - e.g., "Isaiah 6:1-7:6" or "9:5-9:6"
 * @param {string|null} fallbackBook - book name inherited from prior segment
 * @returns {{ book, beginRef, endRef } | null}
 */
function parseSingleRange(token, fallbackBook = null) {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Pattern A: "Book chapter:verse-chapter:verse" (book name present)
  const withBook = trimmed.match(/^(.+?)\s+(\d+:\d+)-(\d+:?\d*)$/);
  if (withBook) {
    const book = withBook[1];
    const beginRef = withBook[2];
    let endRef = withBook[3];
    if (!endRef.includes(':')) {
      endRef = `${beginRef.split(':')[0]}:${endRef}`;
    }
    return { book, beginRef, endRef };
  }

  // Pattern B: bare range "chapter:verse-chapter:verse" (no book prefix)
  // Inherits the book from fallbackBook.
  const bare = trimmed.match(/^(\d+:\d+)-(\d+:?\d*)$/);
  if (bare && fallbackBook) {
    const beginRef = bare[1];
    let endRef = bare[2];
    if (!endRef.includes(':')) {
      endRef = `${beginRef.split(':')[0]}:${endRef}`;
    }
    return { book: fallbackBook, beginRef, endRef };
  }

  return null;
}

/**
 * Parse a Haftarah reference string into an array of range segments.
 *
 * Handles all Hebcal Haftarah formats:
 *   - Single range:            "Isaiah 54:1-10"
 *   - Cross-chapter:           "Isaiah 6:1-7:6"
 *   - Comma-separated (same book, discontinuous chapters):
 *                              "Isaiah 6:1-7:6, 9:5-9:6"
 *   - Semicolon-separated (different books):
 *                              "Jeremiah 7:21-8:3; 9:22-23"
 *   - Mixed:                   "I Samuel 20:18-42; 20:42"
 *
 * Semicolons delimit major segments (may introduce a new book).
 * Commas delimit sub-ranges within a major segment (same book).
 * A bare range (no book prefix) inherits the book from the preceding
 * segment, which covers both comma and semicolon continuation.
 *
 * @param {string} refStr - raw Haftarah reference from Hebcal
 * @returns {Array<{ book: string, beginRef: string, endRef: string }>}
 */
export function parseHaftarahSegments(refStr) {
  if (!refStr) return [];

  const segments = [];
  let lastBook = null;

  // Split on semicolons first (major segment boundaries)
  const majorParts = refStr.split(';');

  for (const major of majorParts) {
    // Within each major segment, split on commas (sub-range boundaries)
    const subParts = major.split(',');

    for (const sub of subParts) {
      const parsed = parseSingleRange(sub, lastBook);
      if (parsed) {
        segments.push(parsed);
        lastBook = parsed.book;
      }
    }
  }

  return segments;
}

/**
 * Expand a full Haftarah reference string into individual verse objects.
 *
 * Convenience wrapper: parses the reference into segments via
 * parseHaftarahSegments(), then expands each segment with
 * expandVerseRange() and concatenates the results.
 *
 * @param {string} refStr - raw Haftarah reference (e.g., "Isaiah 6:1-7:6, 9:5-9:6")
 * @returns {Array<{ reference: string, sefariaUrl: string }>}
 */
export function expandHaftarahVerses(refStr) {
  const segments = parseHaftarahSegments(refStr);
  if (segments.length === 0) return [];

  return segments.flatMap((seg) => expandVerseRange(seg.book, seg.beginRef, seg.endRef));
}

/**
 * Parse a Haftarah reference string into book, start, end.
 *
 * LEGACY wrapper: returns only the first segment for backward
 * compatibility. New code should use parseHaftarahSegments() or
 * expandHaftarahVerses() instead.
 *
 * @param {string} refStr - e.g., "Isaiah 27:6-28:13"
 * @returns {{ book, beginRef, endRef } | null}
 */
export function parseHaftarahReference(refStr) {
  const segments = parseHaftarahSegments(refStr);
  return segments.length > 0 ? segments[0] : null;
}

// ============================================================
// Holiday + Weekday date-based reading resolution (Commit 3a)
// ============================================================

/**
 * Classify a single leyning result into an occasion tag.
 *
 * Uses structural fields from the Hebcal return, not name strings
 * or day-of-week. The three-way branch is clean and unambiguous:
 *
 *   weekday  → has `.weekday` (3 aliyot, no fullkriyah)
 *   shabbat  → has `.parsha` + `.fullkriyah` (regular parashah)
 *   holiday  → has `.fullkriyah` but no `.parsha` (festival/special)
 *
 * Verified against real getLeyningOnDate output for:
 *   - Plain Shabbat (Ha'azinu): parsha + fullkriyah → 'shabbat'
 *   - Special Shabbat (Miketz/Chanukah): parsha + fullkriyah + reason → 'shabbat'
 *   - Rosh Hashanah I on Shabbat: fullkriyah, no parsha → 'holiday'
 *   - Rosh Hashanah II (Sunday): fullkriyah, no parsha → 'holiday'
 *   - Sukkot I on Shabbat: fullkriyah, no parsha → 'holiday'
 *   - Sukkot Chol ha-Moed (Wednesday): fullkriyah (4 aliyot), no parsha → 'holiday'
 *   - Rosh Chodesh (Monday): fullkriyah (4 aliyot), no parsha → 'holiday'
 *   - Monday weekday (Ha'azinu): weekday (3 aliyot) → 'weekday'
 *   - Monday before combined parashah (Nitzavim-Vayeilech): weekday → 'weekday'
 *   - Thursday weekday (Toldot): weekday → 'weekday'
 *
 * @param {object} reading - A single leyning result from getLeyningOnDate
 * @returns {'shabbat'|'holiday'|'weekday'}
 */
function classifyOccasion(reading) {
  // Weekday readings have a .weekday property instead of .fullkriyah
  if (reading.weekday) {
    return 'weekday';
  }

  // Regular Shabbat parashah: has both .parsha and .fullkriyah.
  // This includes special Shabbatot (Shabbat Shuva, Chanukah on Shabbat, etc.)
  // which have a .reason block but are still the regular parashah.
  // A holiday on Shabbat (e.g., RH I on Shabbat) has .fullkriyah
  // but NOT .parsha, so it correctly falls through to 'holiday'.
  if (reading.parsha && reading.fullkriyah) {
    return 'shabbat';
  }

  // Holiday/festival/special reading: has .fullkriyah but no .parsha.
  // This is the locked boundary: holiday readings never go through
  // the triennial mapper, even when they fall on Shabbat.
  // Includes: major holidays (RH, YK, Sukkot, Pesach, Shavuot),
  // chol ha-moed (4 aliyot), and Rosh Chodesh (4 aliyot).
  if (reading.fullkriyah) {
    return 'holiday';
  }

  // Should not reach here with getLeyningOnDate output.
  // Log for visibility if it ever does.
  console.warn('[classifyOccasion] Unclassifiable reading:', Object.keys(reading));
  return 'holiday';
}

/**
 * Resolve all leyning readings for a given date.
 *
 * Feed it the student's mitzvah_date; it returns an array of reading
 * candidates, each tagged with its occasion type. The coordinator picks
 * one (or more) in the Commit 3b UI, and the chosen occasion tag is
 * written to the readings.occasion column at creation time.
 *
 * Return patterns by date type (verified against real Hebcal output):
 *   - Plain Shabbat: 1 reading (regular parashah, occasion 'shabbat')
 *   - Holiday on Shabbat: 1 reading (holiday only; parashah suppressed)
 *   - Holiday on weekday: 1 reading (holiday, occasion 'holiday')
 *   - Chol ha-Moed / Rosh Chodesh: 1 reading (4 aliyot, occasion 'holiday')
 *   - Mon/Thu: 1 reading (3 aliyot from upcoming parashah, occasion 'weekday')
 *   - Days without leyning (Tue/Wed/Fri/Sun non-holiday): 0 readings
 *
 * IMPORTANT: Holiday and weekday readings are fixed full readings.
 * Only regular Shabbat parshiyot (occasion === 'shabbat') go through
 * the triennial mapper. This function does NOT apply triennial; that
 * remains the job of parseTriennialAliyot() called separately for
 * occasion === 'shabbat' in the UI layer (Commit 3b).
 *
 * For all occasion types, parseAliyot() reads the correct aliyot
 * (it picks .weekday or .fullkriyah, whichever is present).
 *
 * @param {string} dateStr - ISO date string (e.g., "2026-09-12")
 * @returns {{ readings: Array, date: string, dow: number, hebrewDate: string, error: string|null }}
 */
export function resolveReadingsForDate(dateStr) {
  try {
    const date = new Date(dateStr + 'T12:00:00');
    const hd = new HDate(date);
    const dow = date.getDay(); // 0=Sun .. 6=Sat

    // getLeyningOnDate with wantarray returns an array of 0+ readings.
    // Each reading is a Leyning or LeyningWeekday object.
    // Args: hd (HDate), il=false (diaspora), wantarray=true.
    const rawReadings = getLeyningOnDate(hd, false, true);

    // Normalize to array (getLeyningOnDate with wantarray should always
    // return an array, but be defensive)
    const readingArray = Array.isArray(rawReadings)
      ? rawReadings
      : rawReadings ? [rawReadings] : [];

    // Map each raw reading into a structured candidate
    const readings = readingArray.map((raw, index) => {
      const occasion = classifyOccasion(raw);

      // Extract name: shape is always { en: '...', he: '...' } from
      // getLeyningOnDate (verified for all occasion types including
      // combined parshiyot like Nitzavim-Vayeilech).
      let nameEn = '';
      let nameHe = null;
      if (raw.name && typeof raw.name === 'object') {
        nameEn = raw.name.en || '';
        nameHe = raw.name.he || null;
      } else if (typeof raw.name === 'string') {
        nameEn = raw.name;
      }

      return {
        index,
        occasion,
        name: nameEn,
        nameHebrew: nameHe,
        summary: raw.summary || null,
        haftara: raw.haftara || null,
        haftaraNumV: raw.haftaraNumV || null,
        // Aliyot data: fullkriyah for Shabbat/holiday, weekday for weekday.
        // Downstream: parseAliyot() reads whichever is present.
        // parseTriennialAliyot() is only used for occasion === 'shabbat'
        // and requires a ParshaEvent, not these raw objects.
        fullkriyah: raw.fullkriyah || null,
        weekday: raw.weekday || null,
        // Pass through fields useful for display or special-Shabbat handling
        reason: raw.reason || null,
        spiHaftara: raw.sephardic || raw.seph || null,
      };
    });

    return {
      readings,
      date: dateStr,
      dow,
      hebrewDate: hd.toString(),
      error: null,
    };
  } catch (err) {
    console.error('[resolveReadingsForDate] Error:', err);
    return {
      readings: [],
      date: dateStr,
      dow: null,
      hebrewDate: null,
      error: err.message,
    };
  }
}
