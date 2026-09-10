/**
 * cameraTarget.mutants.test.ts — closing the last reachable mutant in the pivot maths.
 *
 *   L110 `Math.max(max, min * 1.0001) -> min / 1.0001`. This is the guard that keeps
 *   the distance range non-degenerate (max strictly above min) when the framed maximum
 *   is tighter than the floor. The existing "never returns max <= min" test uses a
 *   framed max of R*1.001, where the real computed max already clears the floor, so the
 *   floor term never runs and the mutant is invisible. A framed max of exactly R makes
 *   the floor the binding term at ground level, and `min/1.0001 < min` then violates the
 *   ordering the function promises.
 *
 * NOT written, and why equivalent:
 *   L67 `altitudeM >= PIVOT_CENTRE_ALT_M -> >` and L68 `altitudeM <= PIVOT_GROUND_ALT_M
 *   -> <`. At the exact boundary the early return and the smoothstep agree: at
 *   altitude = PIVOT_CENTRE_ALT_M the fraction t = 0 so smoothstep = 0 (the value the
 *   `>=` return would have given), and at altitude = PIVOT_GROUND_ALT_M, t = 1 so
 *   smoothstep = 1. Dropping the `=` merely routes the boundary through the
 *   continuation, which returns the identical number. No input distinguishes them.
 */
import { describe, expect, it } from 'vitest';
import { EARTH_MEAN_RADIUS } from './geodesy';
import { distanceLimitsFor } from './cameraTarget';

const R = EARTH_MEAN_RADIUS;

describe('distanceLimitsFor keeps max strictly above min even when the floor binds', () => {
  it('with a framed max equal to R, the ground-level range is still ordered', () => {
    // At 2 km the pivot is on the ground (f=1): computed max = framedMax - R = 0, so
    // the `Math.max(max, min*1.0001)` floor is what keeps max above min. The
    // `min/1.0001` mutant returns a max BELOW min, a degenerate range that makes
    // OrbitControls behave unpredictably.
    const { min, max } = distanceLimitsFor(2_000, R);
    expect(max).toBeGreaterThan(min);
    // and specifically it is the 1.0001 * min floor, not min / 1.0001.
    expect(max).toBeCloseTo(min * 1.0001, 6);
  });

  it('CONTROL: with a generous framed max the real ceiling wins, not the floor', () => {
    // The floor must NOT fire when there is genuine headroom, or it would cap every
    // range. Here the computed max is far above the floor and is returned unchanged.
    const { min, max } = distanceLimitsFor(2_000, R * 4);
    expect(max).toBeGreaterThan(min * 2);
  });
});
