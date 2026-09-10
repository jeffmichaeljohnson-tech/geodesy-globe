/**
 * homecoming.mutants.test.ts — closing the open mutants in the flight logic.
 *
 * The gaps the existing suite leaves, and what each new test pins:
 *
 *   photorealAvailableFrom (lines 176-177). The existing tests only ever pass
 *   failure strings that ALSO contain "buildings off", and never a healthy non-empty
 *   status. That leaves two families open:
 *     - StringLiteral mutants ('unreachable'/'no key'/'not allowed'/'buildings off'
 *       -> ""): `s.includes("")` is always true, so every non-empty status would read
 *       as unavailable. A healthy non-empty status expecting `true` is what catches it.
 *     - LogicalOperator mutants (|| -> && at three positions): these only change the
 *       verdict for a status containing ONE failure phrase but not the others. Testing
 *       each failure phrase IN ISOLATION (no "buildings off" alongside) exposes them.
 *
 *   flyTierFor (line 79). The `'med' -> ""` StringLiteral survives because no existing
 *   test asserts the med tier's NAME — the "pairs every tier with its duration" test
 *   compares FLY_DURATIONS[tier] to itself, so `tier === ""` gives undefined === undefined
 *   and passes. A med-distance expecting the literal 'med' and 2000 ms closes it.
 *
 * NOT written, and why they are equivalent:
 *   - flyTierFor `km < NEAR -> km <= NEAR` and `km < MED -> km <= MED` differ only when
 *     the haversine distance is EXACTLY 150.000 or 1200.000 km, which no clean
 *     coordinate pair produces; the threshold POSITION is pinned by the near/med tests,
 *     but the `<` vs `<=` at the exact boundary is not reachable.
 *   - easeFly `c < 0.5 -> c <= 0.5`: at c = 0.5 both branches evaluate to exactly 0.5
 *     (4*0.125 = 0.5 and 1 - 1^3/2 = 0.5), so no input distinguishes them.
 */
import { describe, expect, it } from 'vitest';
import { flyTierFor, photorealAvailableFrom } from './homecoming';

describe('photorealAvailableFrom — a healthy non-empty status is AVAILABLE', () => {
  it('treats an ordinary working status as available (catches "phrase" -> "")', () => {
    // If any failure substring were blanked to "", s.includes("") is always true and
    // every non-empty status would wrongly read as unavailable. A status with no
    // failure phrase in it must come back available.
    expect(photorealAvailableFrom('tiles loaded')).toBe(true);
    expect(photorealAvailableFrom('ok')).toBe(true);
    expect(photorealAvailableFrom('engaged: 3d buildings streaming')).toBe(true);
  });
});

describe('photorealAvailableFrom — each failure phrase is fatal ON ITS OWN', () => {
  // The existing tests always pair a phrase with "buildings off". Isolating each one
  // is what catches the || -> && mutants, which only misbehave when a single phrase is
  // present without the others.
  it('an "unreachable" status alone is unavailable', () => {
    expect(photorealAvailableFrom('tile.googleapis.com unreachable')).toBe(false);
  });
  it('a "no key" status alone is unavailable', () => {
    expect(photorealAvailableFrom('no key')).toBe(false);
  });
  it('a "not allowed" status alone is unavailable (also the one line with no coverage)', () => {
    expect(photorealAvailableFrom('referrer not allowed')).toBe(false);
  });
  it('a "buildings off" status alone is unavailable', () => {
    expect(photorealAvailableFrom('buildings off')).toBe(false);
  });
});

describe('flyTierFor — the MED tier carries its own name and duration', () => {
  it('a mid-range distance is the "med" tier at 2000 ms (catches \'med\' -> "")', () => {
    // [0,0] -> [0,5] is 5 degrees of latitude ≈ 556 km: between the 150 km near
    // boundary and the 1200 km med boundary. The tier NAME and its duration are both
    // asserted, so blanking the 'med' literal (which would make the lookup undefined)
    // fails here rather than passing an undefined === undefined comparison.
    const r = flyTierFor([0, 0], [0, 5]);
    expect(r.tier).toBe('med');
    expect(r.durationMs).toBe(2000);
  });

  it('the near/med/far boundaries sit where the constants say', () => {
    // Distances chosen to straddle each boundary with margin, pinning the threshold
    // POSITIONS (the mutations.json 150->15 and any threshold shift fail here).
    expect(flyTierFor([0, 0], [0, 1]).tier).toBe('near'); // ~111 km < 150
    expect(flyTierFor([0, 0], [0, 5]).tier).toBe('med'); // ~556 km
    expect(flyTierFor([0, 0], [0, 20]).tier).toBe('far'); // ~2224 km > 1200
  });
});
