/**
 * depthRange.ts — near/far planes that stay usable from orbit to a street corner.
 *
 * ── THE PROBLEM ─────────────────────────────────────────────────────────────
 * The camera descends across FIVE ORDERS OF MAGNITUDE: ~20,000 km at the orbital
 * framing down to a few hundred metres at neighbourhood level. One fixed depth
 * range cannot serve both ends.
 *
 * The previous rule was `near = max(1000, altitude * 0.2)` with
 * `far = dist + 3R`. The 1 km floor is invisible from orbit and fatal near the
 * ground: at 500 m altitude the near plane sits at 1 km, which is BEHIND the
 * scene, so the camera renders nothing at all. Not a subtle artefact — an empty
 * screen at exactly the altitude JJ asked for.
 *
 * ── WHY FAR MUST SHRINK TOO, WHICH IS THE LESS OBVIOUS HALF ─────────────────
 * Lowering `near` alone trades a blank screen for z-fighting. Depth precision
 * depends on the RATIO far/near, not on either alone. Dropping near to 1 m while
 * far stays at ~25,000 km gives a ratio of 2.5e7, and a 24-bit depth buffer
 * cannot resolve that — surfaces flicker against each other.
 *
 * The fix is geometric rather than a fudge factor: from 500 m up, the horizon is
 * only about 80 km away. There is nothing to draw beyond it, because the planet
 * curves out of view. So `far` can follow the horizon distance, and the ratio
 * stays bounded at every altitude.
 *
 *   horizon = sqrt(2*R*h + h^2)     — exact for a sphere, from the tangent line
 *
 * At h = 500 m that is 79.8 km; at h = 19,000 km it is 24,556 km, which is why
 * the orbital case still needs the old whole-globe far and is kept by the min().
 *
 * Pure, so the ratio can be asserted across the whole descent in a test rather
 * than discovered as flicker on someone's screen.
 */

/**
 * IUGG mean radius R1 = (2a + b) / 3 for the WGS84 ellipsoid, in metres.
 *
 * NOT the same number as `EARTH_MEAN_RADIUS` in `geodesyMath`, which is the
 * nominal 6_371_000 used for great-circle work. They differ by 8.77 m, and this
 * comment used to claim they matched. Both are defensible for their own job —
 * horizon distance wants the volumetric mean, arc length wants the conventional
 * one — but they are different quantities and saying otherwise invites someone
 * to "fix" one to the other. `constants.test.ts` pins this to the derivation.
 */
export const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Largest far/near ratio we will accept.
 *
 * A 24-bit depth buffer holds roughly 1e7 distinguishable steps in the worst
 * case, and z precision is concentrated near the camera, so 1e6 leaves real
 * headroom. This is asserted by test at every altitude rather than assumed.
 */
export const MAX_DEPTH_RATIO = 1e6;

export interface DepthRange {
  near: number;
  far: number;
}

/**
 * Distance to the visible horizon from `altitudeM` above a sphere of `radiusM`.
 * Exact (tangent-line) rather than the small-angle approximation, because at
 * orbital altitude the approximation is wrong by thousands of kilometres.
 */
export function horizonDistanceM(altitudeM: number, radiusM = EARTH_RADIUS_M): number {
  const h = Math.max(0, altitudeM);
  return Math.sqrt(2 * radiusM * h + h * h);
}

/**
 * Near and far planes for a camera at `altitudeM` above the surface, whose
 * distance to the planet's centre is `distToCentreM`.
 *
 * `near` tracks altitude so the ground stays in front of it, with a 1 m floor —
 * below that a browser's depth precision is the binding constraint, not us.
 * `far` is the lesser of "enough to see the whole globe" and "enough to reach
 * the horizon with margin", so it collapses on descent instead of dragging a
 * 25,000 km range down to the ground with it.
 */
export function depthRangeFor(altitudeM: number, distToCentreM: number, radiusM = EARTH_RADIUS_M): DepthRange {
  const alt = Math.max(0, altitudeM);

  // 15% of altitude keeps the ground comfortably beyond the plane while giving
  // the largest near value the altitude allows, which is what buys precision.
  const near = Math.max(1, alt * 0.15);

  // 1.6x the horizon: enough that terrain right at the horizon is not clipped
  // mid-descent, without paying for distance that is over the curve anyway.
  const horizonFar = horizonDistanceM(alt, radiusM) * 1.6;
  // The orbital case still needs to enclose the whole planet.
  const globalFar = distToCentreM + 3 * radiusM;
  // A floor so a camera on the surface still has a usable scene.
  const far = Math.max(Math.min(globalFar, horizonFar), near * 1000);

  return { near, far };
}
