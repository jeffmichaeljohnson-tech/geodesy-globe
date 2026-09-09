import { describe, it, expect } from 'vitest';
import {
  EARTH_DEG_PER_SEC,
  EARTH_TRUE_SPEED,
  ORBITAL_SPEED,
  REFERENCE_ALT_KM,
  autoRotateSpeedFor,
  degPerSecFor,
} from './autoRotate';
import { PIVOT_GROUND_ALT_M } from './cameraTarget';

const GROUND_KM = PIVOT_GROUND_ALT_M / 1000; // 60

/**
 * Fraction of the frame the ground sweeps per second — what a person actually
 * perceives, and the quantity the first two attempts at this got wrong.
 * Only the centre-pivot component translates the sub-camera point, hence (1 - f);
 * the visible ground width is 2·h·tan(halfFovX).
 */
const HALF_FOV_X = Math.atan(Math.tan((15 * Math.PI) / 180) * 1.6);
const R_KM = 6371;
function screenFractionPerSec(altitudeKm: number): number {
  const speed = autoRotateSpeedFor(altitudeKm);
  const radPerSec = (degPerSecFor(speed) * Math.PI) / 180;
  const C = 400, G = 60;
  const t = altitudeKm >= C ? 0 : altitudeKm <= G ? 1 : (C - altitudeKm) / (C - G);
  const f = altitudeKm >= C ? 0 : altitudeKm <= G ? 1 : t * t * (3 - 2 * t);
  const groundWidthKm = 2 * altitudeKm * Math.tan(HALF_FOV_X);
  return (radPerSec * R_KM * (1 - f)) / groundWidthKm;
}

describe('the Earth constant', () => {
  it('turns 360 degrees in a sidereal day', () => {
    expect(EARTH_DEG_PER_SEC).toBeCloseTo(0.0041781, 6);
  });

  it('EARTH_TRUE_SPEED drives OrbitControls at exactly that rate', () => {
    expect(degPerSecFor(EARTH_TRUE_SPEED)).toBeCloseTo(EARTH_DEG_PER_SEC, 9);
  });
});

describe('autoRotateSpeedFor — perceived motion, not angular rate', () => {
  it('keeps the tuned drift at and above the reference altitude', () => {
    // The signature orbital view must be untouched; JJ approved it at 14,378 km.
    expect(autoRotateSpeedFor(REFERENCE_ALT_KM)).toBeCloseTo(ORBITAL_SPEED, 9);
    expect(autoRotateSpeedFor(14_378)).toBeCloseTo(ORBITAL_SPEED, 9);
    expect(autoRotateSpeedFor(50_000)).toBeCloseTo(ORBITAL_SPEED, 9);
  });

  it('HOLDS PERCEIVED SPEED CONSTANT ACROSS THE ORBITAL BAND — the actual fix', () => {
    // Scaling the angular rate let perceived motion accelerate from 0.86%/s at
    // orbit to 23%/s at 400 km — nearly a quarter of the frame every second.
    // That is what "moving WAY too fast" was.
    const reference = screenFractionPerSec(REFERENCE_ALT_KM);
    for (const alt of [10_000, 5000, 2000, 1000, 600, 400]) {
      expect(screenFractionPerSec(alt)).toBeCloseTo(reference, 6);
    }
    expect(reference).toBeLessThan(0.01); // under 1% of the frame per second
  });

  it('is far slower than the reference by the altitude JJ rejected', () => {
    // 257 km measured 13.9%/s before. It must now be a small fraction of the
    // orbital rate, not a multiple of it.
    expect(screenFractionPerSec(257)).toBeLessThan(screenFractionPerSec(REFERENCE_ALT_KM));
    expect(degPerSecFor(autoRotateSpeedFor(257))).toBeLessThan(
      degPerSecFor(autoRotateSpeedFor(REFERENCE_ALT_KM)) / 40,
    );
  });

  it('reaches the Earth’s own rate by neighbourhood altitude, and never zero', () => {
    expect(autoRotateSpeedFor(GROUND_KM)).toBeCloseTo(EARTH_TRUE_SPEED, 12);
    expect(autoRotateSpeedFor(20)).toBeCloseTo(EARTH_TRUE_SPEED, 12);
    expect(autoRotateSpeedFor(0)).toBeGreaterThan(0);
    expect(degPerSecFor(autoRotateSpeedFor(20))).toBeCloseTo(EARTH_DEG_PER_SEC, 9);
  });

  it('decreases monotonically on descent — no altitude speeds up', () => {
    const alts = [50_000, 14_378, 10_831, 5000, 2000, 1000, 400, 257, 150, 75, 60, 20, 3];
    const speeds = alts.map((a) => autoRotateSpeedFor(a));
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1] + 1e-12);
    }
  });

  it('honours an overridden orbital drift, but never the Earth floor', () => {
    expect(autoRotateSpeedFor(REFERENCE_ALT_KM, 0.5)).toBeCloseTo(0.5, 9);
    expect(autoRotateSpeedFor(3, 0.5)).toBeCloseTo(EARTH_TRUE_SPEED, 12);
    // ?rotate=off still leaves the planet turning at its real rate.
    expect(autoRotateSpeedFor(REFERENCE_ALT_KM, 0)).toBeCloseTo(EARTH_TRUE_SPEED, 12);
  });

  it('never returns NaN or a negative speed', () => {
    expect(autoRotateSpeedFor(Number.NaN)).toBe(ORBITAL_SPEED);
    expect(autoRotateSpeedFor(-100)).toBeGreaterThan(0);
    expect(Number.isFinite(autoRotateSpeedFor(Infinity))).toBe(true);
  });
});
