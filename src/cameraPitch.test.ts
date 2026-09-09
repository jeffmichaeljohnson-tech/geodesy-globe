import { describe, it, expect } from 'vitest';
import { PIVOT_CENTRE_ALT_M } from './cameraTarget';
import {
  PITCH_FLAT_DEG,
  arrivalOffsetForPitch,
  PITCH_TILTED_DEG,
  PITCH_MAX_DEG,
  TILT_THRESHOLD_DEG,
  clampPitchDeg,
  nextPitchStop,
  offsetForPitch,
  pitchDegFor,
  pitchLabelFor,
  type Vec3,
} from './cameraPitch';

const UP: Vec3 = [0, 0, 1]; // local up at the north pole, for simple arithmetic
const NORTH: Vec3 = [1, 0, 0]; // any horizontal reference in that frame

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

describe('pitchDegFor', () => {
  it('is 0 directly overhead and 90 on the horizon plane', () => {
    expect(pitchDegFor([0, 0, 5000], UP)).toBeCloseTo(0, 9);
    expect(pitchDegFor([5000, 0, 0], UP)).toBeCloseTo(90, 9);
  });

  it('measures the angle between the offset and local up', () => {
    expect(pitchDegFor([1, 0, 1], UP)).toBeCloseTo(45, 9);
  });

  it('never returns NaN when the offset is exactly along up', () => {
    // acos of a quotient a hair past 1.0 is NaN, and a NaN pitch would silently
    // disable the clamp that keeps the camera above ground. The dot/length
    // quotient is clamped before acos precisely to stop that.
    for (const d of [1, 1e3, 1e7, 6.371e6]) {
      expect(Number.isNaN(pitchDegFor([0, 0, d], UP))).toBe(false);
      expect(Number.isNaN(pitchDegFor([0, 0, -d], UP))).toBe(false);
    }
  });

  it('returns 0 for degenerate input rather than NaN', () => {
    expect(pitchDegFor([0, 0, 0], UP)).toBe(0);
    expect(pitchDegFor([0, 0, 1], [0, 0, 0])).toBe(0);
  });
});

describe('nextPitchStop / pitchLabelFor — the phone cycle, unchanged', () => {
  it('walks flat -> tilted -> max -> flat', () => {
    expect(nextPitchStop(PITCH_FLAT_DEG)).toBe(PITCH_TILTED_DEG);
    expect(nextPitchStop(PITCH_TILTED_DEG)).toBe(PITCH_MAX_DEG);
    expect(nextPitchStop(PITCH_MAX_DEG)).toBe(PITCH_FLAT_DEG);
  });

  it('treats anything under the tilt threshold as flat', () => {
    // A stray drag leaving the camera at 0.4 degrees must still offer 3D next,
    // not MAX — otherwise the control skips a stop for no visible reason.
    expect(nextPitchStop(0.4)).toBe(PITCH_TILTED_DEG);
    expect(nextPitchStop(TILT_THRESHOLD_DEG - 0.001)).toBe(PITCH_TILTED_DEG);
    expect(nextPitchStop(TILT_THRESHOLD_DEG)).toBe(PITCH_MAX_DEG);
  });

  it('resolves any angle between the stops the same way the phone does', () => {
    const mid = (PITCH_TILTED_DEG + PITCH_MAX_DEG) / 2; // 70
    expect(nextPitchStop(mid - 0.001)).toBe(PITCH_MAX_DEG);
    expect(nextPitchStop(mid)).toBe(PITCH_FLAT_DEG);
    expect(nextPitchStop(95)).toBe(PITCH_FLAT_DEG); // past max, e.g. after a clamp race
  });

  it('labels the DESTINATION, not the current state', () => {
    expect(pitchLabelFor(PITCH_TILTED_DEG)).toBe('3D');
    expect(pitchLabelFor(PITCH_MAX_DEG)).toBe('MAX');
    expect(pitchLabelFor(PITCH_FLAT_DEG)).toBe('2D');
  });

  it('a full cycle of taps returns to where it started', () => {
    let p = PITCH_FLAT_DEG;
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) { p = nextPitchStop(p); seen.push(p); }
    expect(seen).toEqual([PITCH_TILTED_DEG, PITCH_MAX_DEG, PITCH_FLAT_DEG]);
  });

  it('never proposes a stop outside the reachable band', () => {
    for (const p of [-10, 0, 5, 10, 55, 70, 85, 90, 180, NaN]) {
      const n = nextPitchStop(p);
      expect(n).toBeGreaterThanOrEqual(PITCH_FLAT_DEG);
      expect(n).toBeLessThanOrEqual(PITCH_MAX_DEG);
    }
  });
});

describe('clampPitchDeg', () => {
  it('keeps the camera above ground and out of the sky', () => {
    expect(clampPitchDeg(-5)).toBe(PITCH_FLAT_DEG);
    expect(clampPitchDeg(90)).toBe(PITCH_MAX_DEG);
    expect(clampPitchDeg(179)).toBe(PITCH_MAX_DEG);
    expect(clampPitchDeg(55)).toBe(55);
  });

  it('is total — NaN clamps to flat rather than propagating', () => {
    expect(clampPitchDeg(NaN)).toBe(PITCH_FLAT_DEG);
  });
});

describe('offsetForPitch', () => {
  it('produces exactly the requested pitch', () => {
    const start: Vec3 = [0, 0, 1000];
    for (const want of [0, 15, 55, 85]) {
      const o = offsetForPitch(start, UP, want, NORTH);
      expect(pitchDegFor(o, UP)).toBeCloseTo(want, 6);
    }
  });

  it('PRESERVES DISTANCE — tilting must not also zoom', () => {
    const start: Vec3 = [300, 0, 900];
    const d0 = len(start);
    for (const want of [0, 30, 55, 85]) {
      expect(len(offsetForPitch(start, UP, want, NORTH))).toBeCloseTo(d0, 6);
    }
  });

  it('PRESERVES HEADING — tilting must not also spin the view', () => {
    // Start with a heading of +Y and check the horizontal component still points
    // along +Y afterwards. A tilt that rotated the heading would read as the map
    // spinning under the user for no reason they asked for.
    const start: Vec3 = [0, 400, 900];
    const o = offsetForPitch(start, UP, 85, NORTH);
    expect(o[0]).toBeCloseTo(0, 6);
    expect(o[1]).toBeGreaterThan(0);
  });

  it('uses the fallback heading only when genuinely overhead', () => {
    // Dead overhead: the azimuth is undefined, like the pole of a spherical
    // frame. Without a stable fallback the first tilt would pick a random
    // direction and read as a lurch.
    const o = offsetForPitch([0, 0, 1000], UP, 85, NORTH);
    expect(pitchDegFor(o, UP)).toBeCloseTo(85, 6);
    expect(o[0]).toBeGreaterThan(0); // leaned along the fallback (+X)
    expect(o[1]).toBeCloseTo(0, 6);
  });

  it('clamps a requested pitch past max instead of going underground', () => {
    expect(pitchDegFor(offsetForPitch([0, 0, 1000], UP, 120, NORTH), UP)).toBeCloseTo(PITCH_MAX_DEG, 6);
  });

  it('is stable when the fallback is itself parallel to up', () => {
    // Both the offset and the fallback degenerate: returning the input beats
    // emitting a zero vector, which would collapse the camera onto the anchor
    // and blank the screen.
    const start: Vec3 = [0, 0, 1000];
    expect(offsetForPitch(start, UP, 55, [0, 0, 5])).toEqual(start);
  });

  it('round-trips through a real ECEF frame, not just the pole', () => {
    // Manhattan: local up is the radial direction, and none of the components
    // are zero — the case where a sloppy implementation that assumed an
    // axis-aligned frame would still pass every test above.
    const up = ((): Vec3 => {
      const lat = (40.7128 * Math.PI) / 180, lon = (-74.006 * Math.PI) / 180;
      return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    })();
    const east: Vec3 = [-Math.sin((-74.006 * Math.PI) / 180), Math.cos((-74.006 * Math.PI) / 180), 0];
    const start: Vec3 = [
      up[0] * 3000 + east[0] * 100,
      up[1] * 3000 + east[1] * 100,
      up[2] * 3000 + east[2] * 100,
    ];
    for (const want of [0, 55, 85]) {
      const o = offsetForPitch(start, up, want, east);
      expect(pitchDegFor(o, up)).toBeCloseTo(want, 5);
      expect(len(o)).toBeCloseTo(len(start), 5);
    }
  });
});

/** height of an offset along `up` — a local dot so the test needs no unexported helper. */
function dotFor(o: Vec3, u: Vec3): number {
  const l = Math.hypot(u[0], u[1], u[2]) || 1;
  return (o[0] * u[0] + o[1] * u[1] + o[2] * u[2]) / l;
}

describe('arrivalOffsetForPitch — the altitude a flight actually keeps', () => {
  // A flight lands NADIR above its anchor: offset purely along up, length == altitude.
  const up: Vec3 = [0, 1, 0];
  const north: Vec3 = [0, 0, 1];
  const nadir = (altM: number): Vec3 => [0, altM, 0];
  /** Height above the anchor, which is what groundPivotFactor and the HUD both read. */
  const vertical = (o: Vec3, u: Vec3) => dotFor(o, u);

  it('PRESERVES the altitude it was flown to — the defect that broke zoom', () => {
    // Before this function existed the arrival kept only cos(45) = 0.707 of its
    // altitude, so zoom stepped 2.83x in and 1.41x out and minus-then-plus sank the
    // camera by half. Measured live at 0.706x, three times identically.
    for (const altM of [20_000, 74_600, 150_000, 338_000, 399_000]) {
      const o = arrivalOffsetForPitch(nadir(altM), up, 45, north);
      expect(vertical(o, up)).toBeCloseTo(altM, 3);
    }
  });

  it('never parks the camera above the altitude it was asked for', () => {
    // THE REGRESSION GUARD. The first fix scaled the offset out by 1/cos(pitch) and left
    // the rotation to a later frame, so the camera sat one frame at h/cos(45) = 1.414h.
    // Above PIVOT_CENTRE_ALT_M * cos(45) ~= 283 km that clears the 400 km anchor line,
    // the anchor drops and the pitch is discarded unapplied: 338 km landed at 478 km,
    // nadir. Asserting the height never EXCEEDS the request is what makes that
    // two-step implementation fail here instead of in JJ's hands.
    for (const altM of [283_000, 300_000, 338_000, 380_000, 399_000]) {
      const o = arrivalOffsetForPitch(nadir(altM), up, 45, north);
      expect(vertical(o, up)).toBeLessThanOrEqual(altM * 1.001);
      expect(vertical(o, up)).toBeLessThan(PIVOT_CENTRE_ALT_M);
    }
  });

  it('holds for every pitch the clamp allows, not just 45', () => {
    for (const deg of [0, 15, 30, 45, 60, PITCH_MAX_DEG]) {
      const o = arrivalOffsetForPitch(nadir(120_000), up, deg, north);
      expect(vertical(o, up)).toBeCloseTo(120_000, 3);
      // and the camera really is tilted by the angle asked for
      expect(pitchDegFor(o, up)).toBeCloseTo(clampPitchDeg(deg), 6);
    }
  });

  it('leans along the SAME heading the pitch controller would, so arrival does not snap', () => {
    // Arrival and the controller must pass the same fallback heading, or the first eased
    // frame swings the camera sideways. Same input, same output is the cheap check.
    const a = arrivalOffsetForPitch(nadir(90_000), up, 45, north);
    const b = offsetForPitch([a[0], a[1], a[2]], up, 45, north);
    expect(b[0]).toBeCloseTo(a[0], 6);
    expect(b[2]).toBeCloseTo(a[2], 6);
  });
});
