/**
 * Tests for the near/far planes across the whole descent.
 *
 * The two failures being prevented are both invisible in code review and obvious
 * on screen, which is the worst combination:
 *   1. near plane BEYOND the scene -> the camera renders nothing at all;
 *   2. far/near ratio too large    -> z-fighting, surfaces flickering.
 * The old rule (`near = max(1000, alt*0.2)`, `far = dist + 3R`) produced (1) at
 * every altitude below about 5 km, which is precisely the range needed for
 * neighbourhood-level buildings.
 */
import { describe, expect, it } from 'vitest';
import {
  depthRangeFor,
  EARTH_RADIUS_M,
  horizonDistanceM,
  MAX_DEPTH_RATIO,
} from './depthRange';

const R = EARTH_RADIUS_M;

/** The altitudes the camera actually passes through, orbit to street. */
const DESCENT_M = [
  20_000_000, // orbital framing
  3_714_000, // the altitude seen in a real session screenshot
  1_000_000,
  100_000,
  10_000,
  2_000,
  500, // neighbourhood — the target
  100,
  10,
  0, // on the surface
];

describe('horizonDistanceM', () => {
  it('is zero at the surface', () => {
    expect(horizonDistanceM(0)).toBe(0);
  });

  it('matches the textbook value for a person-height viewpoint', () => {
    // ~4.7 km from 1.7 m up. If this drifts, the formula has been "simplified".
    expect(horizonDistanceM(1.7) / 1000).toBeCloseTo(4.65, 1);
  });

  it('is about 80 km from 500 m — the reason `far` may collapse on descent', () => {
    expect(horizonDistanceM(500) / 1000).toBeCloseTo(79.8, 0);
  });

  it('grows monotonically with altitude', () => {
    for (let i = 1; i < DESCENT_M.length; i++) {
      expect(horizonDistanceM(DESCENT_M[i - 1])).toBeGreaterThan(horizonDistanceM(DESCENT_M[i]));
    }
  });

  it('uses the exact tangent form, not the small-angle approximation', () => {
    // sqrt(2Rh) alone is wrong by thousands of km at orbital altitude; the h^2
    // term is what fixes it. At 20,000 km the difference is enormous.
    const h = 20_000_000;
    const approx = Math.sqrt(2 * R * h);
    expect(horizonDistanceM(h)).toBeGreaterThan(approx * 1.4);
  });
});

describe('depthRangeFor', () => {
  it('keeps the ground IN FRONT of the near plane at every altitude', () => {
    // The whole point. A near plane beyond the ground renders an empty screen.
    for (const alt of DESCENT_M) {
      const { near } = depthRangeFor(alt, R + alt);
      expect(near).toBeLessThan(Math.max(alt, 1) + 1);
    }
  });

  it('is usable at neighbourhood altitude, where the old rule was not', () => {
    const { near, far } = depthRangeFor(500, R + 500);
    // Old rule gave near = max(1000, 100) = 1000 m: behind the scene.
    expect(near).toBeLessThan(500);
    expect(near).toBeGreaterThanOrEqual(1);
    expect(far).toBeGreaterThan(50_000); // still reaches the horizon
  });

  it('never exceeds the depth-precision ratio, at any altitude', () => {
    // Lowering `near` alone would trade a blank screen for z-fighting. This is
    // the assertion that keeps `far` honest.
    for (const alt of DESCENT_M) {
      const { near, far } = depthRangeFor(alt, R + alt);
      expect(far / near).toBeLessThanOrEqual(MAX_DEPTH_RATIO);
    }
  });

  it('still encloses the whole planet from orbit', () => {
    const alt = 20_000_000;
    const { far } = depthRangeFor(alt, R + alt);
    // Must reach past the far limb, or the globe is clipped in half.
    expect(far).toBeGreaterThan(alt);
  });

  it('collapses `far` on descent instead of dragging orbital range to the ground', () => {
    const high = depthRangeFor(20_000_000, R + 20_000_000);
    const low = depthRangeFor(500, R + 500);
    expect(low.far).toBeLessThan(high.far / 100);
  });

  it('near and far are always positive and ordered', () => {
    for (const alt of DESCENT_M) {
      const { near, far } = depthRangeFor(alt, R + alt);
      expect(near).toBeGreaterThan(0);
      expect(far).toBeGreaterThan(near);
    }
  });

  it('survives a camera on the surface without producing a degenerate range', () => {
    const { near, far } = depthRangeFor(0, R);
    expect(near).toBe(1);
    expect(far).toBeGreaterThan(near);
    expect(Number.isFinite(far)).toBe(true);
  });

  it('treats a negative altitude as the surface rather than returning nonsense', () => {
    const { near, far } = depthRangeFor(-50, R);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
  });
});
