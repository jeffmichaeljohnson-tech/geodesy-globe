import { describe, expect, it } from 'vitest';
import { WGS84, WGS84_B, WGS84_E2, geodeticToEcef } from './geodesyMath';

/**
 * Conformance vectors for the WGS84 ellipsoid.
 *
 * WHY THIS FILE EXISTS. Every other assertion about `geodeticToEcef` in this
 * package is blind to the flattening, and that is not obvious until you try it:
 *
 *   - the equatorial cases are f-independent by definition — flattening has no
 *     effect on a point at latitude 0;
 *   - the polar case asserts `z ≈ WGS84_B`, and `WGS84_B` is *derived* from `f`,
 *     so expected and actual move together and the check can never fail;
 *   - the round-trip and rebasing cases are self-consistent under any ellipsoid.
 *
 * Measured: changing `f` from 1/298.257223563 to 1/300 left the whole suite
 * green at 180 passing, while displacing ECEF positions by up to ~135 m at
 * mid-latitudes. These vectors close that gap.
 *
 * ON WHAT IS AND IS NOT INDEPENDENT HERE. `a` and `1/f` are the *defining*
 * WGS84 parameters, and `b` and `e²` below are the published derived values —
 * those four are external anchors, not numbers this repository produced. The
 * ECEF vectors are regression pins: they were computed with the same
 * closed-form formula the code uses, so they catch drift in `a`, `f`, `e²` or
 * the formula, but they are NOT an independent oracle for that formula.
 */
describe('WGS84 defining parameters', () => {
  it('semi-major axis is exactly the defining value', () => {
    expect(WGS84.a).toBe(6378137.0);
  });

  it('inverse flattening is the defining value', () => {
    expect(1 / WGS84.f).toBeCloseTo(298.257223563, 9);
  });

  it('semi-minor axis matches the published derived value', () => {
    // Published, not computed from WGS84.f — that is the whole point.
    expect(WGS84_B).toBeCloseTo(6356752.314245, 6);
  });

  it('first eccentricity squared matches the published derived value', () => {
    expect(WGS84_E2).toBeCloseTo(0.00669437999014, 14);
  });
});

describe('geodeticToEcef conformance vectors away from the equator', () => {
  const CASES: ReadonlyArray<readonly [string, number, number, number, readonly [number, number, number]]> = [
    ['45N on the prime meridian', 45, 0, 0, [4517590.879, 0.0, 4487348.409]],
    ['Greenwich observatory', 51.4778, -0.0015, 0, [3980581.21, -104.211, 4966824.522]],
    ['Sydney', -33.8688, 151.2093, 0, [-4646051.272, 2553206.342, -3534372.388]],
  ];

  for (const [name, lat, lon, alt, want] of CASES) {
    it(`${name} lands within a millimetre`, () => {
      const got = geodeticToEcef(lat, lon, alt);
      expect(got[0]).toBeCloseTo(want[0], 3);
      expect(got[1]).toBeCloseTo(want[1], 3);
      expect(got[2]).toBeCloseTo(want[2], 3);
    });
  }
});
