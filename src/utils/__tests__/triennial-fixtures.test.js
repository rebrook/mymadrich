/**
 * Triennial Aliyot Test Fixtures for MyMadrich
 *
 * Verify parseTriennialAliyot() output against known data from
 * the Hebcal website. Run after installing @hebcal/triennial.
 *
 * Usage:
 *   node src/utils/__tests__/triennial-fixtures.test.js
 *
 * Or adapt for your test runner of choice.
 */

import { HebrewCalendar, ParshaEvent } from '@hebcal/core';
import { parseTriennialAliyot, getTriennialCycleYear } from '../hebcal';

// ============================================================
// Helper: find ParshaEvent for a given Gregorian date string
// ============================================================

function findParshaEvent(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const events = HebrewCalendar.calendar({
    start: date,
    end: date,
    sedrot: true,
    noHolidays: true,
    il: false,
  });
  return events.find(
    (ev) => ev instanceof ParshaEvent || ev.getDesc().startsWith('Parashat')
  );
}

// ============================================================
// FIXTURE 0: Noach 5787 (Oct 17, 2026) = Year 2
//
// Source: console.log diagnostic + Hebcal website
// Used to verify the triReading.aliyot nesting fix.
// ============================================================

const NOACH_5787_Y2 = {
  date: '2026-10-17', // Saturday
  expectedParsha: 'Noach',
  expectedCycleYear: 2,
  expectedAliyot: [
    { number: '1', book: 'Genesis', beginRef: '8:15',  endRef: '8:22',  verseCount: 8 },
    { number: '2', book: 'Genesis', beginRef: '9:1',   endRef: '9:7',   verseCount: 7 },
    { number: '3', book: 'Genesis', beginRef: '9:8',   endRef: '9:17',  verseCount: 10 },
    { number: '4', book: 'Genesis', beginRef: '9:18',  endRef: '9:29',  verseCount: 12 },
    { number: '5', book: 'Genesis', beginRef: '10:1',  endRef: '10:14', verseCount: 14 },
    { number: '6', book: 'Genesis', beginRef: '10:15', endRef: '10:20', verseCount: 6 },
    { number: '7', book: 'Genesis', beginRef: '10:21', endRef: '10:32', verseCount: 12 },
    { number: 'M', book: 'Genesis', beginRef: '10:26', endRef: '10:32', verseCount: 7 },
  ],
};

// ============================================================
// FIXTURE 1: Nitzavim-Vayeilech 5786 (Sep 5, 2026) = Year 1
//
// Source: https://www.hebcal.com/sedrot/nitzavim-vayeilech-20260905
// This is a combined parashah. Triennial Year 1 covers the
// Nitzavim portion (Deuteronomy 29:9 through 30:14).
// ============================================================

const NITZAVIM_VAYEILECH_5786_Y1 = {
  date: '2026-09-05', // Saturday
  expectedParsha: 'Nitzavim-Vayeilech',
  expectedCycleYear: 1,
  expectedAliyot: [
    { number: '1', book: 'Deuteronomy', beginRef: '29:9',  endRef: '29:11', verseCount: 3 },
    { number: '2', book: 'Deuteronomy', beginRef: '29:12', endRef: '29:14', verseCount: 3 },
    { number: '3', book: 'Deuteronomy', beginRef: '29:15', endRef: '29:28', verseCount: 14 },
    { number: '4', book: 'Deuteronomy', beginRef: '30:1',  endRef: '30:3',  verseCount: 3 },
    { number: '5', book: 'Deuteronomy', beginRef: '30:4',  endRef: '30:6',  verseCount: 3 },
    { number: '6', book: 'Deuteronomy', beginRef: '30:7',  endRef: '30:10', verseCount: 4 },
    { number: '7', book: 'Deuteronomy', beginRef: '30:11', endRef: '30:14', verseCount: 4 },
    { number: 'M', book: 'Deuteronomy', beginRef: '30:11', endRef: '30:14', verseCount: 4 },
  ],
};

// ============================================================
// FIXTURE 2: Combined parashah in Cycle Year 3 (CJLS 2020 rule)
//
// Nitzavim-Vayeilech 5788 (Sep 16, 2028) = Year 3
// Source: https://www.hebcal.com/sedrot/nitzavim-vayeilech-20280916
//
// The 2020 CJLS ruling (Rabbi Miles B. Cohen) modified the
// triennial cycle for combined parshiyot so that Year 3 reads
// the THIRD section of the parashah. For Nitzavim-Vayeilech
// combined, Year 3 should read from the Vayeilech portion
// (Deuteronomy 31:1-31:30).
//
// This is the edge case most likely to surface a mapping surprise.
// If the package implements the CJLS 2020 rule correctly, Y3
// will NOT repeat Y1's Nitzavim portion but will instead read
// from Vayeilech. Verify against the Hebcal website.
//
// NOTE: The exact aliyah boundaries for Y3 must be confirmed
// from Hebcal's website for 5788. The values below are
// placeholders that must be updated after checking:
//   https://www.hebcal.com/sedrot/nitzavim-vayeilech-20280916
// ============================================================

const NITZAVIM_VAYEILECH_5788_Y3 = {
  date: '2028-09-16', // Saturday
  expectedParsha: 'Nitzavim-Vayeilech',
  expectedCycleYear: 3,
  // TODO: Fill in exact aliyah boundaries from Hebcal website
  // before running this test. The key assertion is that Y3
  // reads from Deuteronomy 31 (Vayeilech), not Deuteronomy 29-30
  // (Nitzavim). If aliyah 1 begins at 31:x, the CJLS rule is
  // correctly applied.
  expectedAliyot: null, // Set to array once verified
  expectedBookChapter: 31, // Y3 aliyot should be in Deut chapter 31
};

// ============================================================
// Test runner (simple console-based assertions)
// ============================================================

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  // --- Fixture 0: Noach 5787 Y2 (regression for aliyot nesting fix) ---

  console.log('\nFixture 0: Noach 5787 (Year 2) — aliyot nesting regression');
  console.log('============================================================');

  const ev0 = findParshaEvent(NOACH_5787_Y2.date);
  assert(ev0 != null, 'Found ParshaEvent for 2026-10-17');

  if (ev0) {
    const desc0 = ev0.getDesc().replace('Parashat ', '');
    assert(
      desc0 === NOACH_5787_Y2.expectedParsha,
      `Parashah name: "${desc0}" === "${NOACH_5787_Y2.expectedParsha}"`
    );

    const cycleYear0 = getTriennialCycleYear(ev0);
    assert(
      cycleYear0 === NOACH_5787_Y2.expectedCycleYear,
      `Cycle year: ${cycleYear0} === ${NOACH_5787_Y2.expectedCycleYear}`
    );

    const aliyot0 = parseTriennialAliyot(ev0);
    assert(
      aliyot0.length === NOACH_5787_Y2.expectedAliyot.length,
      `Aliyot count: ${aliyot0.length} === ${NOACH_5787_Y2.expectedAliyot.length}`
    );

    // Key regression assertion: no metadata keys in aliyot
    const badKeys = aliyot0.filter(a => ['aliyot','date','variation','yearNum','haft','haftara','haftaraNumV'].includes(a.number));
    assert(
      badKeys.length === 0,
      `No metadata keys leaked into aliyot (found ${badKeys.length} bad entries)`
    );

    for (let i = 0; i < NOACH_5787_Y2.expectedAliyot.length; i++) {
      const actual = aliyot0[i];
      const expected = NOACH_5787_Y2.expectedAliyot[i];
      if (!actual) {
        assert(false, `Aliyah ${expected.number}: missing from output`);
        continue;
      }
      assert(
        actual.number === expected.number &&
        actual.book === expected.book &&
        actual.beginRef === expected.beginRef &&
        actual.endRef === expected.endRef &&
        actual.verseCount === expected.verseCount,
        `Aliyah ${expected.number}: ${actual.book} ${actual.beginRef}-${actual.endRef} (${actual.verseCount}v)`
      );
    }
  }

  // --- Fixture 1: Nitzavim-Vayeilech 5786 Y1 ---

  console.log('\nFixture 1: Nitzavim-Vayeilech 5786 (Year 1)');
  console.log('============================================');

  const ev1 = findParshaEvent(NITZAVIM_VAYEILECH_5786_Y1.date);
  assert(ev1 != null, 'Found ParshaEvent for 2026-09-05');

  if (ev1) {
    const desc = ev1.getDesc().replace('Parashat ', '');
    assert(
      desc === NITZAVIM_VAYEILECH_5786_Y1.expectedParsha,
      `Parashah name: "${desc}" === "${NITZAVIM_VAYEILECH_5786_Y1.expectedParsha}"`
    );

    const cycleYear = getTriennialCycleYear(ev1);
    assert(
      cycleYear === NITZAVIM_VAYEILECH_5786_Y1.expectedCycleYear,
      `Cycle year: ${cycleYear} === ${NITZAVIM_VAYEILECH_5786_Y1.expectedCycleYear}`
    );

    const aliyot = parseTriennialAliyot(ev1);
    assert(
      aliyot.length === NITZAVIM_VAYEILECH_5786_Y1.expectedAliyot.length,
      `Aliyot count: ${aliyot.length} === ${NITZAVIM_VAYEILECH_5786_Y1.expectedAliyot.length}`
    );

    for (let i = 0; i < NITZAVIM_VAYEILECH_5786_Y1.expectedAliyot.length; i++) {
      const actual = aliyot[i];
      const expected = NITZAVIM_VAYEILECH_5786_Y1.expectedAliyot[i];
      if (!actual) {
        assert(false, `Aliyah ${expected.number}: missing from output`);
        continue;
      }
      assert(
        actual.number === expected.number &&
        actual.book === expected.book &&
        actual.beginRef === expected.beginRef &&
        actual.endRef === expected.endRef &&
        actual.verseCount === expected.verseCount,
        `Aliyah ${expected.number}: ${actual.book} ${actual.beginRef}-${actual.endRef} (${actual.verseCount}v) === ${expected.book} ${expected.beginRef}-${expected.endRef} (${expected.verseCount}v)`
      );
    }
  }

  // --- Fixture 2: Nitzavim-Vayeilech 5788 Y3 (CJLS 2020) ---

  console.log('\nFixture 2: Nitzavim-Vayeilech 5788 (Year 3, CJLS 2020)');
  console.log('========================================================');

  const ev2 = findParshaEvent(NITZAVIM_VAYEILECH_5788_Y3.date);
  assert(ev2 != null, 'Found ParshaEvent for 2028-09-16');

  if (ev2) {
    const desc2 = ev2.getDesc().replace('Parashat ', '');
    assert(
      desc2 === NITZAVIM_VAYEILECH_5788_Y3.expectedParsha,
      `Parashah name: "${desc2}" === "${NITZAVIM_VAYEILECH_5788_Y3.expectedParsha}"`
    );

    const cycleYear2 = getTriennialCycleYear(ev2);
    assert(
      cycleYear2 === NITZAVIM_VAYEILECH_5788_Y3.expectedCycleYear,
      `Cycle year: ${cycleYear2} === ${NITZAVIM_VAYEILECH_5788_Y3.expectedCycleYear}`
    );

    const aliyot2 = parseTriennialAliyot(ev2);
    assert(aliyot2.length > 0, `Triennial aliyot returned (count: ${aliyot2.length})`);

    // Key CJLS 2020 assertion: Y3 of a combined parashah should
    // read from the THIRD section. For Nitzavim-Vayeilech, this
    // means Deuteronomy chapter 31 (Vayeilech), not chapters 29-30
    // (Nitzavim).
    if (aliyot2.length > 0) {
      const firstAliyahChapter = parseInt(aliyot2[0].beginRef.split(':')[0], 10);
      assert(
        firstAliyahChapter === NITZAVIM_VAYEILECH_5788_Y3.expectedBookChapter,
        `CJLS 2020 check: Y3 first aliyah starts in chapter ${firstAliyahChapter} (expected ${NITZAVIM_VAYEILECH_5788_Y3.expectedBookChapter})`
      );

      // Print actual aliyot for manual verification
      console.log('\n  Actual Y3 aliyot (verify against Hebcal website):');
      for (const a of aliyot2) {
        console.log(`    ${a.name} (${a.number}): ${a.book} ${a.beginRef}-${a.endRef} (${a.verseCount}v)`);
      }
    }
  }

  // --- Summary ---

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('SOME TESTS FAILED. Review output above.');
    process.exit(1);
  } else {
    console.log('All tests passed.');
  }
}

runTests();
