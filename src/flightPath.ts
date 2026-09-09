/**
 * flightPath.ts — where the camera is, part-way through a flight.
 *
 * Kept out of `CameraRig` deliberately. The rig is a frame loop with a camera, an
 * OrbitControls instance and a moving coordinate origin in it; none of that can be
 * unit-tested. This is the part that can be, and the part with a trap in it.
 *
 * ── THE TRAP: LONGITUDE ─────────────────────────────────────────────────────────
 * Interpolating longitude naively takes the LONG way round whenever a journey crosses
 * the antimeridian. Detroit (−83.05°) to Tokyo (139.69°) is 137° eastward, but
 * `from + (to − from) * t` walks 223° westward instead — the camera sails backwards
 * across the Atlantic, Europe and Asia to arrive at the same place.
 *
 * The master plan records the identical defect in the arc renderer: "geo-utils' math
 * picks the minor arc correctly but emits no unwrapping, so Tokyo→LA jumps +179 to
 * −179 and draws a 358° streak." Same shape, same fix — unwrap the delta into
 * [−180, 180] before interpolating.
 *
 * ── ALTITUDE ────────────────────────────────────────────────────────────────────
 * Interpolated on the same eased parameter as the ground track, so the descent and the
 * travel finish together. No parabolic arc: every journey this serves either descends
 * (orbit → a place) or climbs (a place → orbit), and adding a hump to a pure descent
 * would make the camera rise before falling for no reason the visitor asked for.
 */

/** A point the camera can occupy, in the frame the flight is expressed in. */
export interface FlightPoint {
  latDeg: number;
  lonDeg: number;
  altitudeM: number;
}

/**
 * Shortest signed angular distance from `a` to `b`, in degrees, in [−180, 180].
 *
 * This is the whole antimeridian fix. −83 → 139.69 yields +137.26, not −223.
 */
export function shortestLonDelta(aDeg: number, bDeg: number): number {
  let d = (bDeg - aDeg) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Fold a longitude back into [−180, 180], the range the rest of the geodesy uses. */
export function normaliseLon(lonDeg: number): number {
  let l = ((lonDeg + 180) % 360 + 360) % 360 - 180;
  // ((-180 + 180) % 360) lands on 0 -> -180; keep +180 reachable rather than flipping sign
  if (Object.is(l, -0)) l = 0;
  return l;
}

/**
 * The camera's position at eased progress `t` (0 → 1) along a flight.
 *
 * `t` is expected to be ALREADY EASED — `homecoming.easeFly` owns the shape of the
 * motion, this owns the geometry. Keeping them apart means the easing can change
 * without touching the antimeridian handling, and vice versa.
 */
export function flightPointAt(from: FlightPoint, to: FlightPoint, t: number): FlightPoint {
  const k = Math.min(1, Math.max(0, t));
  const lat = from.latDeg + (to.latDeg - from.latDeg) * k;
  const lon = normaliseLon(from.lonDeg + shortestLonDelta(from.lonDeg, to.lonDeg) * k);
  const alt = from.altitudeM + (to.altitudeM - from.altitudeM) * k;
  return { latDeg: lat, lonDeg: lon, altitudeM: alt };
}
