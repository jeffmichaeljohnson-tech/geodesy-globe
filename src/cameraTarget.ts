/**
 * cameraTarget.ts — what the camera orbits around, as it descends.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 * `CameraRig` sets `controls.target` to Earth's CENTRE. From orbit that is
 * exactly right: you orbit the planet and always face it. At 2 km it means the
 * camera stares straight down — and a nadir view of a city is a flat carpet of
 * rooftops. Observed 2026-08-17 over Tokyo: terrain streaming, 190 building
 * tiles, 611,062 triangles, 117 fps, and a uniform grey frame. Nothing was
 * broken. There was simply no way to look at the buildings from the side.
 *
 * The plan asked for "a camera that descends continuously from orbit to ground".
 * It descends; it could not TILT, and without tilt there is no street-level view
 * of anything.
 *
 * ── THE NON-OBVIOUS PART, WHICH COST A WRONG FIRST DESIGN ───────────────────
 * Moving the target from Earth's centre toward the ground point beneath the
 * camera does NOT by itself rotate the view. Both lie on the same ray from the
 * camera, so the LOOK DIRECTION is identical either way.
 *
 * What changes is what an orbit gesture PIVOTS AROUND. With the target at the
 * centre, dragging swings the camera around the whole planet — the view stays
 * nadir at every altitude, which is why tilt felt impossible. With the target on
 * the ground beneath the camera, the same drag raises and lowers the camera's
 * elevation angle about that point, which IS tilt. The fix is not a new control;
 * it is moving the pivot.
 *
 * ── WHY THE DISTANCE LIMITS MUST MOVE WITH IT ───────────────────────────────
 * OrbitControls' `minDistance`/`maxDistance` are measured to the TARGET. With the
 * target at Earth's centre, "60 m above the ground" is `R + 60`. With the target
 * on the ground, the same constraint is just `60`. Blending the target without
 * blending the limits would clamp the camera to a radius six thousand kilometres
 * from where it should be — the camera would appear to teleport. The two must
 * move together, which is why one module owns both.
 *
 * Pure: no three.js, no controls object, no DOM. This is exactly the kind of
 * geometry that fails silently and looks like "the controls feel wrong".
 */

// From the three-free core, not './geodesy' — this module's header promises
// "no three.js", and reaching through geodesy.ts would pull three into its graph.
import { EARTH_MEAN_RADIUS } from './geodesyMath';

/**
 * Altitude band across which the pivot migrates from Earth's centre to the
 * ground. Chosen to sit ABOVE the tile-engagement altitudes (buildings engage
 * around 30 km, terrain around 220 km) so the pivot has finished moving by the
 * time there is detailed geometry worth tilting around — the transition happens
 * while the view is still a plain globe and nothing is there to draw attention
 * to it.
 */
export const PIVOT_GROUND_ALT_M = 60_000; // fully ground-pivoted at and below
export const PIVOT_CENTRE_ALT_M = 400_000; // fully centre-pivoted at and above

/** How close the camera may come to its pivot at ground level, in metres. */
export const MIN_GROUND_DISTANCE_M = 60;

/**
 * 0 = pivot on Earth's centre (orbital behaviour), 1 = pivot on the ground point
 * beneath the camera (tiltable, street-level behaviour).
 *
 * Smoothstep rather than linear so the change in feel eases in and out instead
 * of starting and stopping abruptly — the camera's motion language is heavy
 * damping and slow deceleration, and a linear ramp reads as a mechanism.
 */
export function groundPivotFactor(altitudeM: number): number {
  if (altitudeM >= PIVOT_CENTRE_ALT_M) return 0;
  if (altitudeM <= PIVOT_GROUND_ALT_M) return 1;
  const t = (PIVOT_CENTRE_ALT_M - altitudeM) / (PIVOT_CENTRE_ALT_M - PIVOT_GROUND_ALT_M);
  return t * t * (3 - 2 * t); // smoothstep
}

/**
 * Where the pivot sits, as a distance from Earth's centre along the camera's own
 * radial direction. 0 is the centre; EARTH_MEAN_RADIUS is the ground directly
 * beneath the camera.
 *
 * Returned as a scalar rather than a vector so this stays free of any maths
 * library; the caller multiplies by the camera's normalised position.
 */
export function pivotRadiusFor(altitudeM: number, radiusM = EARTH_MEAN_RADIUS): number {
  return radiusM * groundPivotFactor(altitudeM);
}

export interface DistanceLimits {
  min: number;
  max: number;
}

/**
 * Distance limits measured to the CURRENT pivot, so they stay consistent as the
 * pivot migrates.
 *
 * At the centre pivot the floor is `R + 60` (60 m above the ground, measured from
 * the centre). At the ground pivot it is plain `60`. Interpolating on the same
 * factor keeps the camera's actual reachable altitude continuous through the
 * transition — which is the property the test pins, because getting it wrong
 * looks like the camera lurching for no reason.
 */
export function distanceLimitsFor(
  altitudeM: number,
  framedMaxFromCentre: number,
  radiusM = EARTH_MEAN_RADIUS,
): DistanceLimits {
  const f = groundPivotFactor(altitudeM);
  const min = (radiusM + MIN_GROUND_DISTANCE_M) * (1 - f) + MIN_GROUND_DISTANCE_M * f;
  // The ceiling shrinks by the pivot's own displacement, so the reachable
  // altitude above the surface is unchanged by where the pivot happens to be.
  const max = framedMaxFromCentre - radiusM * f;
  return { min, max: Math.max(max, min * 1.0001) };
}

/**
 * The camera's altitude above the surface, given its distance to whatever the
 * pivot currently is. The inverse of the above, and the reason it exists: the
 * HUD and the depth range both want a TRUE altitude, and once the pivot moves,
 * "distance to target" stops being that.
 */
export function altitudeFromPivotDistance(
  distToPivotM: number,
  pivotRadiusM: number,
  radiusM = EARTH_MEAN_RADIUS,
): number {
  return distToPivotM + pivotRadiusM - radiusM;
}
