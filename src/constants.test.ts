import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { WGS84, WGS84_B, EARTH_MEAN_RADIUS, SPHERE_TEXTURE_LON_OFFSET } from './geodesyMath';
import { sphereToEcefMatrix } from './geodesy';
import { EARTH_RADIUS_M } from './depthRange';
import { ORBITAL_SPEED, REFERENCE_ALT_KM, autoRotateSpeedFor } from './autoRotate';
import { TILT_THRESHOLD_DEG, PITCH_TILTED_DEG, PITCH_MAX_DEG, nextPitchStop } from './cameraPitch';
import { MAX_FIT_DIST, fitDistanceForAspect, FOV_Y_RAD } from './framing';

/**
 * Constants pinned against LITERALS.
 *
 * WHY THIS FILE EXISTS. A mutation sweep changed six constants and the suite
 * stayed green for every one. The cause was systematic rather than six separate
 * oversights: the assertions were written *in terms of the constant they were
 * testing*, so changing it moved the expectation with it.
 *
 *   expect(autoRotateSpeedFor(REFERENCE_ALT_KM)).toBeCloseTo(ORBITAL_SPEED)
 *
 * That reads like a check and cannot fail. Doubling ORBITAL_SPEED doubles both
 * sides. The same shape appeared in the pitch threshold, the framing clamp, and
 * the polar geodesy case, where `z` was compared against a constant derived from
 * the very value under test.
 *
 * These assertions name the number. They are deliberately brittle: a value that
 * changes on purpose should require this file to change too, visibly, in the
 * same commit.
 */
describe('constants pinned to literals, not to themselves', () => {
  it('auto-rotate settles at 0.06 deg/s', () => {
    expect(ORBITAL_SPEED).toBeCloseTo(0.06, 10);
    expect(autoRotateSpeedFor(REFERENCE_ALT_KM)).toBeCloseTo(0.06, 9);
  });

  it('the pitch tilt threshold is 10 degrees, and the stops are 55 and 85', () => {
    expect(TILT_THRESHOLD_DEG).toBe(10);
    expect(PITCH_TILTED_DEG).toBe(55);
    expect(PITCH_MAX_DEG).toBe(85);
    expect(nextPitchStop(9.999)).toBe(55);
    expect(nextPitchStop(10)).toBe(85);
  });

  it('the framing clamp is 12, and a degenerate aspect hits it', () => {
    expect(MAX_FIT_DIST).toBe(12);
    expect(fitDistanceForAspect(0.001, 1)).toBeLessThanOrEqual(12);
  });

  it('the two Earth radii are different numbers, deliberately', () => {
    // depthRange uses IUGG R1 = (2a + b) / 3; geodesyMath uses the nominal value.
    const r1 = (2 * WGS84.a + WGS84_B) / 3;
    expect(EARTH_RADIUS_M).toBeCloseTo(r1, 1);
    expect(EARTH_MEAN_RADIUS).toBe(6_371_000);
    expect(Math.abs(EARTH_RADIUS_M - EARTH_MEAN_RADIUS)).toBeCloseTo(8.8, 1);
  });

  it('sphereToEcefMatrix maps sphere north to ECEF +Z and leaves +X alone', () => {
    expect(SPHERE_TEXTURE_LON_OFFSET).toBe(0);
    const m = sphereToEcefMatrix();
    // sphere +Y (north pole) becomes world +Z
    const north = new Vector3(0, 1, 0).applyMatrix4(m);
    expect(north.x).toBeCloseTo(0, 10);
    expect(north.y).toBeCloseTo(0, 10);
    expect(north.z).toBeCloseTo(1, 10);
    // sphere +X stays on +X only while the longitude offset is zero; a non-zero
    // offset rotates it about Z, which is what makes this assertion load-bearing.
    const prime = new Vector3(1, 0, 0).applyMatrix4(m);
    expect(prime.x).toBeCloseTo(1, 10);
    expect(prime.y).toBeCloseTo(0, 10);
  });
});

describe('the field of view, which nothing pinned', () => {
  it('is 30 degrees, stated as a literal', () => {
    // Found by mutation: FOV_Y_RAD could be changed and the suite stayed green.
    // `framing.test.ts` never imports it, and `homecoming.test.ts` uses it only
    // as an INPUT — never on an expected side. The one identity that looks like
    // a check, fitDistanceForAspect(REF_ASPECT, BASE) === BASE, holds
    // algebraically for any FOV because the half-angle cancels from both terms.
    //
    // Its own comment says it matches the camera in the consuming app, which is
    // a constant whose whole job is to agree with a file this package cannot
    // see. That makes pinning the number here the only check available.
    expect(FOV_Y_RAD).toBeCloseTo((30 * Math.PI) / 180, 12);
    expect((FOV_Y_RAD * 180) / Math.PI).toBeCloseTo(30, 10);
  });
});
