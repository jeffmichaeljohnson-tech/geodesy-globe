/**
 * Tests for the descending camera pivot.
 *
 * The failure being prevented was observed live over Tokyo on 2026-08-17:
 * terrain streaming, 190 building tiles, 611,062 triangles, 117 fps — and a
 * uniform grey frame, because the camera looked straight down and a nadir view
 * of a city is a carpet of rooftops. Nothing was broken. There was no way to
 * look from the side.
 *
 * The subtle half is the distance limits. OrbitControls measures them to the
 * TARGET, so moving the pivot six thousand kilometres without moving the limits
 * clamps the camera somewhere absurd. These tests pin that the reachable
 * ALTITUDE stays continuous while the pivot migrates — that is the property, and
 * it is invisible in code review.
 */
import { describe, expect, it } from 'vitest';
import { EARTH_MEAN_RADIUS } from './geodesy';
import {
  MIN_GROUND_DISTANCE_M,
  PIVOT_CENTRE_ALT_M,
  PIVOT_GROUND_ALT_M,
  altitudeFromPivotDistance,
  distanceLimitsFor,
  groundPivotFactor,
  pivotRadiusFor,
} from './cameraTarget';

const R = EARTH_MEAN_RADIUS;
/** A framed maximum measured from Earth's centre, as CameraRig computes it. */
const FRAMED_MAX = R * 4;

describe('groundPivotFactor', () => {
  it('pivots on Earth CENTRE from orbit — the current, correct orbital behaviour', () => {
    expect(groundPivotFactor(20_000_000)).toBe(0);
    expect(groundPivotFactor(PIVOT_CENTRE_ALT_M)).toBe(0);
  });

  it('pivots on the GROUND at neighbourhood altitude, which is what enables tilt', () => {
    expect(groundPivotFactor(PIVOT_GROUND_ALT_M)).toBe(1);
    expect(groundPivotFactor(2_000)).toBe(1);
    expect(groundPivotFactor(0)).toBe(1);
  });

  it('has finished migrating BEFORE buildings engage at ~30 km', () => {
    // So the change in feel happens while the view is still a plain globe, with
    // no detailed geometry to draw attention to it.
    expect(groundPivotFactor(30_000)).toBe(1);
  });

  it('is monotonic and stays within [0,1] across the whole descent', () => {
    const alts = [20_000_000, 1_000_000, 500_000, PIVOT_CENTRE_ALT_M, 200_000,
      100_000, PIVOT_GROUND_ALT_M, 30_000, 2_000, 0];
    let prev = -1;
    for (const a of alts) {
      const f = groundPivotFactor(a);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(prev); // descending altitude -> rising factor
      prev = f;
    }
  });

  it('eases rather than ramping linearly — the motion language is deceleration', () => {
    const mid = (PIVOT_CENTRE_ALT_M + PIVOT_GROUND_ALT_M) / 2;
    expect(groundPivotFactor(mid)).toBeCloseTo(0.5, 2);
    // Smoothstep is flatter than linear near both ends; a linear ramp would sit
    // at exactly 0.25 a quarter of the way in.
    const quarter = PIVOT_CENTRE_ALT_M - (PIVOT_CENTRE_ALT_M - PIVOT_GROUND_ALT_M) * 0.25;
    expect(groundPivotFactor(quarter)).toBeLessThan(0.25);
  });
});

describe('pivotRadiusFor', () => {
  it('is Earth centre from orbit and the ground beneath the camera down low', () => {
    expect(pivotRadiusFor(20_000_000)).toBe(0);
    expect(pivotRadiusFor(2_000)).toBeCloseTo(R, 6);
  });
});

describe('distanceLimitsFor — the half that is easy to get wrong', () => {
  it('keeps the reachable ALTITUDE floor continuous as the pivot migrates', () => {
    // This is the whole point. min is measured to the pivot, and the pivot moves,
    // so only the derived altitude is comparable across the transition.
    for (const alt of [20_000_000, 500_000, 300_000, 200_000, 100_000, 60_000, 2_000]) {
      const { min } = distanceLimitsFor(alt, FRAMED_MAX);
      const pivot = pivotRadiusFor(alt);
      const floorAlt = altitudeFromPivotDistance(min, pivot);
      expect(floorAlt).toBeCloseTo(MIN_GROUND_DISTANCE_M, 3);
    }
  });

  it('measures from the centre when orbital, and from the ground when low', () => {
    expect(distanceLimitsFor(20_000_000, FRAMED_MAX).min).toBeCloseTo(R + 60, 3);
    expect(distanceLimitsFor(2_000, FRAMED_MAX).min).toBeCloseTo(60, 3);
  });

  it('shrinks the ceiling by the pivot displacement, so reachable height is unchanged', () => {
    const high = distanceLimitsFor(20_000_000, FRAMED_MAX);
    const low = distanceLimitsFor(2_000, FRAMED_MAX);
    expect(high.max).toBeCloseTo(FRAMED_MAX, 3);
    expect(low.max).toBeCloseTo(FRAMED_MAX - R, 3);
  });

  it('never returns max <= min, even with an absurdly tight framed maximum', () => {
    // A degenerate range makes OrbitControls behave unpredictably rather than
    // erroring, which is the worst kind of failure.
    for (const alt of [20_000_000, 200_000, 2_000]) {
      const { min, max } = distanceLimitsFor(alt, R * 1.001);
      expect(max).toBeGreaterThan(min);
    }
  });
});

describe('altitudeFromPivotDistance', () => {
  it('agrees with the plain radial calculation at the centre pivot', () => {
    expect(altitudeFromPivotDistance(R + 2_000, 0)).toBeCloseTo(2_000, 6);
  });

  it('agrees at the ground pivot, where distance-to-target IS the altitude', () => {
    expect(altitudeFromPivotDistance(2_000, R)).toBeCloseTo(2_000, 6);
  });

  it('is continuous through the transition for a camera at a fixed height', () => {
    // A camera physically 100 km up must report 100 km at every pivot position,
    // or the HUD and the depth range disagree with reality mid-descent.
    const trueAlt = 100_000;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const pivot = R * f;
      const dist = R + trueAlt - pivot; // distance from camera to that pivot
      expect(altitudeFromPivotDistance(dist, pivot)).toBeCloseTo(trueAlt, 6);
    }
  });
});
