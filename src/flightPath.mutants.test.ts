/**
 * flightPath.mutants.test.ts — pinning the exactly-±180 unwrap boundary in shortestLonDelta.
 *
 *   L40 `if (d > 180) d -= 360 -> >= 180` and L41 `if (d < -180) d += 360 -> <= -180`.
 *   These differ from the original ONLY when the raw delta `(b - a) % 360` is exactly
 *   +180 or exactly -180 — the antimeridian, reachable from clean coordinates (0 -> 180
 *   and 180 -> 0). The existing "never exceeds a half turn" test bounds |delta| <= 180
 *   and so passes either sign; it cannot see the flip. The convention the code commits
 *   to is +180 for 0->180 and -180 for 180->0, and these pin it.
 *
 * These are PINS, not oracles: ±180 both name the same meridian, so which sign the
 * function returns is a convention, not a fact of the world. The pin makes a change to
 * that convention deliberate; it cannot discover that the convention is "wrong".
 *
 * NOT written, and why:
 *   L47 `((lonDeg+180)%360+360)%360 - 180 -> lonDeg - 180` is ALREADY caught by the
 *   existing "folds values past the antimeridian" test (normaliseLon(190) => -170,
 *   which lonDeg-180 = 10 cannot satisfy). Not re-pinned.
 *   L49 `if (Object.is(l, -0)) l = 0` (cond `-> false`, and `l = 0 -> l = +0`) is
 *   EQUIVALENT: swept every input, the pre-guard value `(…%360) - 180` is never -0
 *   (the `%360` result lands in [0,360), and 180 - 180 is +0), so the guard never fires
 *   and 0 === +0 regardless. It is defensive dead code, and nothing distinguishes the
 *   mutants from the original.
 */
import { describe, expect, it } from 'vitest';
import { shortestLonDelta } from './flightPath';

describe('shortestLonDelta at the exact antimeridian (±180 boundary)', () => {
  it('0 -> 180 resolves to +180, not -180 (catches d > 180 -> d >= 180)', () => {
    // Raw delta is exactly 180; the original leaves it at +180, the `>= 180` mutant
    // subtracts 360 and returns -180. Both are the antimeridian, so this pins the
    // convention rather than a physical truth.
    expect(shortestLonDelta(0, 180)).toBe(180);
  });

  it('180 -> 0 resolves to -180, not +180 (catches d < -180 -> d <= -180)', () => {
    // Raw delta is exactly -180; the `<= -180` mutant adds 360 and returns +180.
    expect(shortestLonDelta(180, 0)).toBe(-180);
  });

  it('CONTROL: an ordinary short delta is unaffected by either boundary', () => {
    // Neither boundary should touch a normal delta; proves the pins above are about the
    // exact ±180 case and not a blanket sign convention.
    expect(shortestLonDelta(10, 30)).toBeCloseTo(20, 9);
    expect(shortestLonDelta(30, 10)).toBeCloseTo(-20, 9);
  });
});
