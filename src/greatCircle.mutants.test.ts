/**
 * greatCircle.mutants.test.ts — closing the open mutants in the slerp core.
 *
 * The existing fixtures prove the arc takes the MINOR way and unwraps longitude
 * cleanly. They do not pin two things, and that is where the survivors live:
 *
 *   1. That the samples are UNIFORMLY spaced in central angle. A plain lerp of the
 *      two endpoint vectors, then normalised (nlerp), traces the SAME great circle —
 *      so the polyline length and the "short way" checks pass unchanged — but bunches
 *      the samples toward the ends. So the mutants that swap slerp for the lerp branch
 *      (`if (sinOmega < 1e-8)` forced true, or the comparison inverted to `>=`)
 *      survive every existing test. Uniform spacing is what distinguishes them.
 *
 *   2. That each sample sits at the CORRECT fraction of the true central angle. The
 *      internal dot product feeds `omega`; the `a[0]*b[0]+… -> a[0]/b[0]` mutant
 *      corrupts omega, yet the midpoint still lands on the a+b bisector (its direction
 *      is independent of omega) so a midpoint check cannot see it. An intermediate
 *      sample at f = 1/8 must be at central angle omega/8 from A, and it is not.
 *
 *   3. The degenerate slerp fallback (`sinOmega < 1e-8`, i.e. coincident OR antipodal
 *      endpoints) is a plain lerp, and its arithmetic (`a + (b-a)*f`) is only ever
 *      exercised there. An exactly-antipodal pair forces that branch with endpoints
 *      whose components are all distinct, so a sign flip, a `/f`, a `b+a`, an emptied
 *      `|| 1` length guard, or a `vz*len` all move a sample off the endpoints it must
 *      still start and finish on.
 *
 * Independent oracles are used wherever one exists (published city-pair distance,
 * symmetry, identity, the slerp central-angle relationship). The antipodal endpoint
 * checks are also oracles: whatever path is chosen through an ill-defined antipodal
 * pair, it MUST begin at A and end at B.
 *
 * NOT written, and why: the unwrap-boundary equality mutants on lines 188-189
 * (`d > 180` -> `>= 180`, `d < -180` -> `<= -180`) differ from the original only when
 * a sample-to-sample longitude step is EXACTLY ±180°, which a sampled arc's small
 * steps never hit — no reachable input distinguishes them (they are the greatCircle
 * cousins of the reachable ±180 boundary in flightPath, which IS pinned there).
 */
import { describe, expect, it } from 'vitest';
import { centralAngle, sampleGreatCircle } from './greatCircle';

const RAD2DEG = 180 / Math.PI;
const NM_MEAN_RADIUS_KM = 6371; // the nominal radius the package uses for arc length

describe('centralAngle — checked against the world, not against itself', () => {
  const LONDON = [51.5074, -0.1278] as const;
  const NEW_YORK = [40.7128, -74.006] as const;

  it('matches the published London–New York great-circle distance (~5570 km)', () => {
    // Published figure ~5570 km. Radius * angle = arc length. Tolerance ±25 km:
    // tight enough to catch a wrong formula, loose enough to absorb the difference
    // between the nominal radius and the exact geodesic on the ellipsoid.
    const km = centralAngle(LONDON[0], LONDON[1], NEW_YORK[0], NEW_YORK[1]) * NM_MEAN_RADIUS_KM;
    expect(km).toBeGreaterThan(5545);
    expect(km).toBeLessThan(5595);
  });

  it('is symmetric and zero on the diagonal', () => {
    expect(centralAngle(LONDON[0], LONDON[1], NEW_YORK[0], NEW_YORK[1]))
      .toBeCloseTo(centralAngle(NEW_YORK[0], NEW_YORK[1], LONDON[0], LONDON[1]), 12);
    expect(centralAngle(LONDON[0], LONDON[1], LONDON[0], LONDON[1])).toBe(0);
  });

  it('obeys the triangle inequality via a waypoint', () => {
    // London -> Reykjavik -> New York can only be longer than London -> New York.
    const REYK = [64.1466, -21.9426] as const;
    const direct = centralAngle(LONDON[0], LONDON[1], NEW_YORK[0], NEW_YORK[1]);
    const viaLeg1 = centralAngle(LONDON[0], LONDON[1], REYK[0], REYK[1]);
    const viaLeg2 = centralAngle(REYK[0], REYK[1], NEW_YORK[0], NEW_YORK[1]);
    expect(viaLeg1 + viaLeg2).toBeGreaterThanOrEqual(direct - 1e-9);
  });
});

describe('sampleGreatCircle spaces samples EVENLY in central angle (slerp, not nlerp)', () => {
  // Tokyo -> LA, a long arc where nlerp and slerp visibly differ in spacing while
  // drawing the identical great circle. Slerp steps are equal to ~1e-9; nlerp bunches
  // toward the ends (ratio ~1.68). A 0.1% band separates them with wide margin.
  const A = [35.6762, 139.6503] as const;
  const B = [34.0522, -118.2437] as const;

  it('every consecutive step is the same central angle (a lerp would bunch them)', () => {
    const s = sampleGreatCircle(A[0], A[1], B[0], B[1], { segments: 64 });
    let min = Infinity;
    let max = 0;
    for (let i = 1; i < s.length; i++) {
      const step = centralAngle(s[i - 1].latDeg, s[i - 1].lonDeg, s[i].latDeg, s[i].lonDeg);
      min = Math.min(min, step);
      max = Math.max(max, step);
    }
    expect(max / min).toBeLessThan(1.001);
  });

  it('places sample k at exactly k/segments of the true central angle from A', () => {
    // The defining slerp property, and independent of the internal dot product: with a
    // correct omega the sample at fraction f is f*omega from A. A corrupted omega
    // (the a[0]*b[0]+… -> a[0]/b[0] mutant) puts it somewhere else.
    const seg = 8;
    const s = sampleGreatCircle(A[0], A[1], B[0], B[1], { segments: seg });
    const omega = centralAngle(A[0], A[1], B[0], B[1]);
    for (const k of [1, 2, 3, 5, 7]) {
      const fromA = centralAngle(A[0], A[1], s[k].latDeg, s[k].lonDeg);
      expect(fromA * RAD2DEG).toBeCloseTo((k / seg) * omega * RAD2DEG, 4);
    }
  });

  it('NEGATIVE CONTROL: the even-spacing check would fail on a lerp path', () => {
    // Prove the spacing check is not vacuous: an exactly-antipodal pair forces the
    // lerp fallback, whose samples are NOT evenly spaced in central angle (they sit at
    // one endpoint or the other), so the ratio is enormous, not ~1.
    const s = sampleGreatCircle(30, 40, -30, -140, { segments: 64 });
    let min = Infinity;
    let max = 0;
    for (let i = 1; i < s.length; i++) {
      const step = centralAngle(s[i - 1].latDeg, s[i - 1].lonDeg, s[i].latDeg, s[i].lonDeg);
      min = Math.min(min, step);
      max = Math.max(max, step);
    }
    expect(max / min).toBeGreaterThan(1.001);
  });
});

describe('the degenerate (antipodal) fallback still starts at A and ends at B', () => {
  // Exactly antipodal: (30,40) and its antipode (-30, -140). sinOmega ≈ 0 forces the
  // lerp branch, whose vector arithmetic is exercised NOWHERE else. Whatever path is
  // taken through an ill-defined antipodal pair, the endpoints are fixed facts, and
  // the first/second half must resolve to A/B respectively. This one test moves the
  // sign-flip, the `/f`, the `b+a`, the emptied `|| 1` length guard, and the `vz*len`
  // latitude mutants — each of which shifts a sample off these positions.
  const seg = 8;
  const s = sampleGreatCircle(30, 40, -30, -140, { segments: seg });

  it('the first sample is A and the last is its antipode B', () => {
    expect(s[0].latDeg).toBeCloseTo(30, 6);
    expect(s[0].lonDeg).toBeCloseTo(40, 6);
    expect(s[seg].latDeg).toBeCloseTo(-30, 6);
    expect(s[seg].lonDeg).toBeCloseTo(-140, 6);
  });

  it('the first half resolves to A and the second half to B (never NaN, never off-axis)', () => {
    // f=0.25 sits in the first half and f=0.75 in the second. A `vz*len` would drop
    // the f=0.25 latitude from 30 to ~7; a slerp of an antipodal pair (the
    // `sinOmega < 1e-8` guard forced false) divides by ~0 and yields NaN here.
    expect(s[2].latDeg).toBeCloseTo(30, 6); // f = 0.25
    expect(s[2].lonDeg).toBeCloseTo(40, 6);
    expect(s[6].latDeg).toBeCloseTo(-30, 6); // f = 0.75
    expect(s[6].lonDeg).toBeCloseTo(-140, 6);
    for (const p of s) {
      expect(Number.isNaN(p.latDeg)).toBe(false);
      expect(Number.isNaN(p.lonDeg)).toBe(false);
    }
  });
});
