/**
 * geodesy.mutants.test.ts — closing the open mutants in the ONE file that imports three.
 *
 * geodesy.ts is the README's joint weak point (60.00%). Its six open mutants split
 * cleanly into two groups, and the split is the whole story of the file:
 *
 *   REACHABLE, and closed here (three NoCoverage mutants):
 *     L48  the OriginRebase default-origin array `[0,0,0]` -> `[]`
 *     L53  the setOrigin body -> `{}`  (a setter that silently does nothing)
 *     L74  the sunDirectionEcef body -> `{}`  (a sun that points nowhere)
 *   None had a test because the existing suite only ever constructs OriginRebase
 *   with an explicit origin and never calls setOrigin or sunDirectionEcef.
 *
 *   EQUIVALENT, and NOT faked here (the three L86 mutants):
 *     `if (SPHERE_TEXTURE_LON_OFFSET === 0) return rotX;`  ->  true / false / !==
 *   SPHERE_TEXTURE_LON_OFFSET is the constant 0, and `makeRotationZ(0)` is the
 *   identity matrix, so the else branch `multiplyMatrices(rotationZ(0), rotX)` is
 *   bit-for-bit equal to `rotX` (verified: all 16 elements identical). Every one of
 *   the three mutants therefore returns the SAME matrix as the original for the only
 *   value the constant can hold. No input distinguishes them; a test that appeared to
 *   "catch" one would only be pinning `rotX`, which is the branch both sides return.
 *   The sphereToEcefMatrix test below pins that matrix as real coverage — it can fail
 *   if the +90°-about-X mapping is ever broken — but it is not claimed to catch L86.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import {
  OriginRebase,
  sunDirectionEcef,
  sphereToEcefMatrix,
  geodeticToEcef,
} from './geodesy';

describe('OriginRebase default origin — the [0,0,0] that must not become []', () => {
  it('a no-argument rebase leaves ECEF positions unchanged', () => {
    // Default origin [0,0,0] -> []: with an empty array, origin[0] is undefined and
    // every subtraction returns NaN. The default only means anything when it is the
    // real zero vector, so a no-arg rebase must be the identity map.
    const rb = new OriginRebase();
    const v = rb.toRender([123, -456, 789]);
    expect([v.x, v.y, v.z]).toEqual([123, -456, 789]);
    // and the stored origin is genuinely three zeros, not a short/empty array
    expect(rb.origin).toEqual([0, 0, 0]);
  });
});

describe('OriginRebase.setOrigin — a setter whose body must not be emptied to {}', () => {
  it('moving the origin moves what toRender subtracts', () => {
    // setOrigin body -> {}: the origin would never move, so toRender would keep
    // subtracting the construction-time origin. Rebasing exists precisely so the
    // origin CAN move as the camera descends; a no-op setter silently defeats it.
    const rb = new OriginRebase([0, 0, 0]);
    rb.setOrigin(1000, 2000, 3000);
    const v = rb.toRender([1000, 2000, 3000]);
    // The point beneath the new origin must rebase to the zero vector.
    expect([v.x, v.y, v.z]).toEqual([0, 0, 0]);
    // and a different point reflects the new origin, not the old [0,0,0].
    const w = rb.toRender([1000, 2000, 3050]);
    expect([w.x, w.y, w.z]).toEqual([0, 0, 50]);
  });
});

describe('sunDirectionEcef — a body that must not be emptied to {}', () => {
  // Independent oracle, not a pin: the sun stands NORTH of the equator around the
  // June solstice and SOUTH around the December solstice. That is a fact of the
  // solar year, stated by an almanac, not by this code. The ECEF +Z axis is the
  // north pole, so the unit sun direction's z-component must carry that sign.
  // Absolute UTC instants, so the assertion is identical at +14 and -11.
  const JUNE = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
  const DEC = new Date(Date.UTC(2026, 11, 21, 12, 0, 0));

  it('returns a unit vector (an emptied body would return undefined)', () => {
    const d = sunDirectionEcef(JUNE);
    expect(d.length()).toBeCloseTo(1, 9);
  });

  it('points into the northern hemisphere in June and the southern in December', () => {
    // sin(±23.4°) ≈ ±0.397; the ellipsoid shifts the normalised z a touch, so bound
    // it loosely but on the correct side of zero — a sign error or an emptied body
    // (undefined.z) both fail here.
    expect(sunDirectionEcef(JUNE).z).toBeGreaterThan(0.37);
    expect(sunDirectionEcef(JUNE).z).toBeLessThan(0.42);
    expect(sunDirectionEcef(DEC).z).toBeLessThan(-0.37);
    expect(sunDirectionEcef(DEC).z).toBeGreaterThan(-0.42);
  });

  it('is the normalised subsolar ECEF point — direction only, magnitude discarded', () => {
    // A weaker cross-check that stays independent of the internals: the direction
    // must be parallel to the subsolar surface point, i.e. the two agree once both
    // are unit length. (Uses geodeticToEcef, which the wgs84 conformance file anchors.)
    const d = sunDirectionEcef(JUNE);
    // subsolar point for JUNE is roughly 23.4N; its ECEF direction has z > 0 and
    // points away from Earth's centre, so the dot with our direction must be ~1.
    const e = geodeticToEcef(23.4, 0, 0);
    const len = Math.hypot(e[0], e[1], e[2]);
    // Only assert the sign/scale sanity that an emptied body cannot satisfy.
    expect(d.x * (e[0] / len) + d.y * (e[1] / len) + d.z * (e[2] / len)).toBeGreaterThan(0.9);
  });
});

describe('sphereToEcefMatrix — the +90° rotation about X (coverage; L86 is equivalent)', () => {
  // The documented basis map: local +Y (north) -> world +Z, local +Z -> world -Y,
  // local +X -> world +X. This pins the matrix that BOTH sides of the L86 branch
  // return, so it is honest coverage rather than a claim to catch an equivalent mutant.
  const apply = (x: number, y: number, z: number) => {
    const v = new Vector3(x, y, z).applyMatrix4(sphereToEcefMatrix());
    return [v.x, v.y, v.z];
  };

  it('sends local north (+Y) to the world north pole (+Z)', () => {
    const [x, y, z] = apply(0, 1, 0);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(1, 9);
  });

  it('leaves +X on +X and sends +Z to -Y', () => {
    const [x1, y1, z1] = apply(1, 0, 0);
    expect([Math.round(x1), Math.round(y1), Math.round(z1)]).toEqual([1, 0, 0]);
    const [x2, y2, z2] = apply(0, 0, 1);
    expect(x2).toBeCloseTo(0, 9);
    expect(y2).toBeCloseTo(-1, 9);
    expect(z2).toBeCloseTo(0, 9);
  });
});
