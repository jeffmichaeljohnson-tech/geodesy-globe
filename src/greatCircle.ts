/**
 * greatCircle.ts — sampling a memorial line along the MINOR great-circle arc.
 *
 * A memorial line connects two points on Earth with a bow of light. The geometry
 * has exactly one classic defect, and this module exists to close it:
 *
 *   Interpolating longitude linearly sends Tokyo (+139.77°) → Los Angeles
 *   (−118.24°) the LONG way, sweeping through longitude 0 (Europe, Africa, the
 *   Atlantic — ~258°) instead of the short way east across the Pacific over the
 *   antimeridian (~102°). On a globe that draws a streak most of the way around
 *   the world.
 *
 * Two independent guards, both exercised by the fixtures in greatCircle.test.ts:
 *
 *   1. MINOR ARC — we interpolate by spherical-linear interpolation (slerp) of the
 *      two endpoint unit vectors. Because the central angle Ω between them is
 *      always in [0, π], the linear blend of the two vectors traces the shorter of
 *      the two ways around. There is no branch to get wrong.
 *
 *   2. LONGITUDE UNWRAPPING — each sample's longitude is emitted twice: `lonDeg`
 *      wrapped to [−180, 180] for display, and `lonUnwrappedDeg` accumulated
 *      continuously so it may pass beyond ±180. A 2D consumer that draws the
 *      unwrapped value gets one connected line instead of one that jumps +179 →
 *      −179 at the antimeridian. The 3D renderer does not need the unwrapped value
 *      — every sample converts to ECEF correctly regardless of its longitude range
 *      — but the fixtures assert on it because that jump is the silent defect.
 *
 * The module is pure geometry (no three.js), so the fixtures are plain unit tests.
 * The renderer converts each sample through `worldOrigin.geodeticToRender`, exactly
 * as the coastlines do, keeping arcs in the same geodetic frame as everything else.
 */
import { EARTH_MEAN_RADIUS } from './geodesy';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface ArcSample {
  /** geodetic latitude, degrees */
  latDeg: number;
  /** longitude wrapped to [−180, 180], degrees */
  lonDeg: number;
  /** longitude accumulated continuously (may exceed ±180), degrees */
  lonUnwrappedDeg: number;
  /** height above the ellipsoid, metres — the bow of the arc */
  altM: number;
  /** fraction along the minor arc, 0 at the first endpoint, 1 at the second */
  f: number;
}

export interface ArcOptions {
  /** number of segments; the sample count is this + 1 */
  segments?: number;
  /**
   * Altitude at the two endpoints, metres — where the arc TOUCHES DOWN.
   *
   * Defaulted to 10 km until 2026-08-20, which contradicted the intent written right
   * here: 10 km is not the ground. On the median 30 km connection that floated both ends
   * a third of the span into the air, and together with the old 120 km bow floor it meant
   * a local memorial line never came near the place it was about. Now 1 km — clear of the
   * surface, invisible at orbital scale, and grounded at the scale these lines actually
   * live at.
   */
  baseAltM?: number;
  /**
   * peak altitude of the bow, metres. When omitted it scales with the arc's
   * angular length so a short hop lifts a little and an ocean-spanning arc lifts a
   * lot, clamped to a sensible band.
   */
  peakAltM?: number;
}

/** Geocentric unit vector for a lat/lon, in the ECEF basis (+X lon 0, +Z north). */
function unitVector(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
}

/**
 * The minor central angle between two geodetic points, radians, in [0, π].
 * Uses the haversine form, which stays accurate for very small separations where
 * the dot-product/acos form loses precision.
 */
export function centralAngle(aLatDeg: number, aLonDeg: number, bLatDeg: number, bLonDeg: number): number {
  const aLat = aLatDeg * DEG2RAD;
  const bLat = bLatDeg * DEG2RAD;
  const dLat = (bLatDeg - aLatDeg) * DEG2RAD;
  const dLon = (bLonDeg - aLonDeg) * DEG2RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Default peak altitude of the bow: a fixed fraction of how far the arc reaches.
 *
 * ── THE FLOOR THAT MADE EVERY LOCAL LINE A SPIKE ─────────────────────────────────────
 * The proportion here is right and always was — `(omega/π) · R · 0.28` works out to about
 * 8.9% of the arc's own length, which is close to the phone's quadratic bezier (its 0.15
 * perpendicular control offset yields a peak near 7.5% of the span). Long arcs read as
 * arcs; that part was never in question.
 *
 * The MINIMUM was the defect: 120 km, absolute, regardless of length. Measured against
 * the real data on 2026-08-20, that is not an edge case — it is the common case:
 *
 *   • the median prayer connection is 30 km long, and 103 of 141 are under 50 km
 *   • at 30 km the floor forced a bow FOUR TIMES TALLER THAN THE ARC IS LONG
 *   • at 5 km, twenty-four times
 *   • nothing has ever crossed an ocean; the longest connection on record is 3,957 km
 *
 * So roughly three quarters of every memorial line was a near-vertical spike whose bulk
 * hung 120 km in the sky, touching the ground only at its two endpoints. That is why the
 * lines looked like they were sliding over the planet rather than fixed to it: they were
 * in exactly the right geodetic frame the whole time, but a structure standing 120 km
 * above the surface PARALLAXES hugely against the terrain behind it as the camera orbits.
 * The eye reads that as "not attached", and it is right to.
 *
 * The floor is now 300 m — enough to lift the line clear of the ground it springs from,
 * small enough that it can never dominate the shape. A neighbourhood arc now bows a few
 * kilometres over a few tens of kilometres, which is a gentle curve, which is what it is.
 */
function defaultPeakAltM(omega: number): number {
  const lift = (omega / Math.PI) * EARTH_MEAN_RADIUS * 0.28;
  return Math.max(300, Math.min(1_500_000, lift));
}

/**
 * Sample the minor great-circle arc between two geodetic endpoints.
 *
 * @returns `segments + 1` samples from the first endpoint to the second, each with
 * wrapped and unwrapped longitude and the bow altitude at that point.
 */
export function sampleGreatCircle(
  aLatDeg: number,
  aLonDeg: number,
  bLatDeg: number,
  bLonDeg: number,
  opts: ArcOptions = {},
): ArcSample[] {
  const segments = Math.max(2, opts.segments ?? 96);
  const baseAltM = opts.baseAltM ?? 1_000;

  const a = unitVector(aLatDeg, aLonDeg);
  const b = unitVector(bLatDeg, bLonDeg);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot); // the minor central angle, [0, π]
  const peakAltM = opts.peakAltM ?? defaultPeakAltM(omega);
  const sinOmega = Math.sin(omega);

  const out: ArcSample[] = [];
  let prevWrapped = NaN;
  let acc = 0;

  for (let i = 0; i <= segments; i++) {
    const f = i / segments;

    // Spherical-linear interpolation of the two endpoint vectors. For a
    // meaningful separation this blends along the minor arc; as omega → 0 the
    // slerp weights degenerate (0/0), so fall back to a plain lerp, which is
    // correct in that limit because the two vectors nearly coincide.
    let vx: number;
    let vy: number;
    let vz: number;
    if (sinOmega < 1e-8) {
      vx = a[0] + (b[0] - a[0]) * f;
      vy = a[1] + (b[1] - a[1]) * f;
      vz = a[2] + (b[2] - a[2]) * f;
    } else {
      const wa = Math.sin((1 - f) * omega) / sinOmega;
      const wb = Math.sin(f * omega) / sinOmega;
      vx = wa * a[0] + wb * b[0];
      vy = wa * a[1] + wb * b[1];
      vz = wa * a[2] + wb * b[2];
    }

    const len = Math.hypot(vx, vy, vz) || 1;
    const latDeg = Math.asin(Math.max(-1, Math.min(1, vz / len))) * RAD2DEG;
    const lonDeg = Math.atan2(vy, vx) * RAD2DEG;

    // Unwrap: accumulate the continuous longitude by removing ±360 jumps.
    if (Number.isNaN(prevWrapped)) {
      acc = lonDeg;
    } else {
      let d = lonDeg - prevWrapped;
      if (d > 180) d -= 360;
      else if (d < -180) d += 360;
      acc += d;
    }
    prevWrapped = lonDeg;

    // A smooth bow: zero extra height at the endpoints, peak at the middle.
    const altM = baseAltM + peakAltM * Math.sin(Math.PI * f);

    out.push({ latDeg, lonDeg, lonUnwrappedDeg: acc, altM, f });
  }

  return out;
}

/**
 * The angular length of a sampled polyline, radians — the sum of the central
 * angles between consecutive samples. For a correct minor arc this equals the
 * central angle between the endpoints; a long-way error makes it 2π minus that.
 * Used by the fixtures to prove the arc took the short way.
 */
export function polylineAngularLength(samples: ArcSample[]): number {
  let total = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    total += centralAngle(
      samples[i].latDeg,
      samples[i].lonDeg,
      samples[i + 1].latDeg,
      samples[i + 1].lonDeg,
    );
  }
  return total;
}
