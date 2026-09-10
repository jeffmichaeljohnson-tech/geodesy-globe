/**
 * geodesyMath.mutants.test.ts — closing the open mutants in the three-free core.
 *
 * geodesyMath.ts is already at 90.53%; these are the last reachable survivors.
 *
 *   ecefToGeodetic polar branch (lines 88, 90). The wgs84 conformance file exercises
 *   the polar altitude branch at the exact poles, where sin(lat) ≈ 1, so `|z|/|sin lat|`
 *   and `|z|*|sin lat|` are indistinguishable and the `> 1` vs `>= 1` boundary never
 *   flips. The only place the branch runs with sin(lat) far from 1 is a point within a
 *   metre of Earth's CENTRE — unphysical, but the exact input that separates these two
 *   mutants. Pinned below.
 *
 *   subsolarPoint precision terms (lines 109, 110). solarConformance.ts anchors the
 *   declination against the almanac to ~0.1°, which cannot see the equation-of-centre's
 *   0.02° second term or the obliquity's ~0.004° annual drift. Two instants pinned to
 *   full precision close all five arithmetic mutants there. These are declared PINS:
 *   they make a change to the NOAA formula deliberate, but (unlike the conformance
 *   oracles beside them) they cannot themselves discover that the formula is wrong.
 *
 * NOT written, and why equivalent:
 *   - mod360 `((x%360)+360)%360 -> x%360 - 360` (line 136): the result differs from the
 *     original by a whole multiple of 360°, and every consumer feeds it to sin/cos
 *     (periodic in 360°) or to normalizeLon (which re-wraps mod 360). Verified: the
 *     subsolar output is bit-unchanged. No input distinguishes them.
 *   - normalizeLon `-> lon - 180` (line 139) is already killed by solarConformance's
 *     "near the prime meridian at noon" check, so it is not re-pinned here.
 */
import { describe, expect, it } from 'vitest';
import { ecefToGeodetic, subsolarPoint } from './geodesyMath';

describe('ecefToGeodetic polar branch — the sin(lat)-far-from-1 case the poles cannot reach', () => {
  it('a point ~1.4 m from Earth’s centre exercises the polar altitude formula honestly', () => {
    // PIN, not an oracle: (1, 0, 1) is 1.41 m from the centre. p = hypot(1,0) = 1, so
    // the `|p| > 1` test takes the POLAR branch, and Bowring's latitude there is
    // ~134.6° whose sine is ~0.71 — nowhere near 1. That is what makes `|z|/|sin lat|`
    // and `|z|*|sin lat|` diverge (by ~0.7 m here), and what makes flipping `> 1` to
    // `>= 1` send the point down the NORMAL branch to a wholly different altitude.
    // There is no independent oracle for the "altitude" of a point inside the planet;
    // this pin exists solely to make that branch's arithmetic non-silent.
    const g = ecefToGeodetic(1, 0, 1);
    expect(g.latDeg).toBeCloseTo(134.61137339190248, 6);
    expect(g.altM).toBeCloseTo(-6346212.135703637, 3);
  });

  it('CONTROL: a point just OUTSIDE the p=1 axis tube takes the normal branch', () => {
    // p = 2 > 1, so the normal branch runs; this is the must-not-fire side and its
    // altitude is a different, larger value — proving the branch really does switch
    // on the |p| > 1 test rather than always taking one side.
    const g = ecefToGeodetic(2, 0, 1);
    expect(g.altM).not.toBeCloseTo(-6346212.135703637, 0);
  });
});

describe('subsolarPoint — precision pins for the terms the almanac oracle cannot see', () => {
  // All instants are absolute UTC (Date.UTC / ...Z), so these are identical under every
  // timezone. Pinned to 1e-6°, which resolves the 0.02° equation-of-centre term and the
  // ~0.004° obliquity drift that the ±0.1° conformance oracles pass straight over.
  const MAR_EQUINOX = new Date('2026-03-20T12:00:00Z'); // near lambda=0: declination
  //                                                        is MOST sensitive to lambda here
  const JUNE_SOLSTICE = new Date(Date.UTC(2026, 5, 21, 8, 25)); // declination = obliquity

  it('pins the March-equinox subsolar point (catches the equation-of-centre mutants)', () => {
    const { latDeg, lonDeg } = subsolarPoint(MAR_EQUINOX);
    expect(latDeg).toBeCloseTo(-0.043446408728816444, 6);
    expect(lonDeg).toBeCloseTo(1.8656194493284488, 6);
  });

  it('pins the June-solstice declination (catches the obliquity-drift mutants)', () => {
    const { latDeg, lonDeg } = subsolarPoint(JUNE_SOLSTICE);
    expect(latDeg).toBeCloseTo(23.435132858556983, 6);
    expect(lonDeg).toBeCloseTo(54.19841186281394, 6);
  });
});
