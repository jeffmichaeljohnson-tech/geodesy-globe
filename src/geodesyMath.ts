/**
 * geodesyMath.ts — the three-free core of the geodetic frame.
 *
 * These are the pure float64 maths and constants of {@link ./geodesy}: no three.js,
 * no GPU types, nothing that pulls the renderer into a chunk. They are split out so
 * the *entry* surface — the accessible text globe, the atlas pick maths, the camera
 * distance constant — can use `EARTH_MEAN_RADIUS`, `subsolarPoint` and
 * `ecefToGeodetic` WITHOUT dragging `three/webgpu` into the initial bundle. The
 * renderer-bound helpers (OriginRebase, sunDirectionEcef, sphereToEcefMatrix) stay
 * in geodesy.ts, which re-exports everything here so existing importers are
 * unchanged.
 *
 * The one non-negotiable architectural decision documented in geodesy.ts still
 * holds: the world/render frame is ECEF metres at real Earth scale, and all
 * geodetic maths are done in JS doubles (float64) before any rebased result is
 * handed to the GPU.
 */

// ---------------------------------------------------------------------------
// WGS84 ellipsoid (the datum GPS and every tile provider use)
// ---------------------------------------------------------------------------
export const WGS84 = {
  /** semi-major axis, metres */
  a: 6_378_137.0,
  /** flattening */
  f: 1 / 298.257223563,
} as const;

/** semi-minor axis b = a(1 − f) */
export const WGS84_B = WGS84.a * (1 - WGS84.f);
/** first eccentricity squared e² = f(2 − f) */
export const WGS84_E2 = WGS84.f * (2 - WGS84.f);
/** A convenient mean radius for the display sphere / camera limits. */
export const EARTH_MEAN_RADIUS = 6_371_000.0;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Geodetic (lat, lon, altitude) → ECEF metres, in float64.
 * @param latDeg  geodetic latitude, degrees  [-90, 90]
 * @param lonDeg  longitude, degrees          [-180, 180]
 * @param altM    height above the ellipsoid, metres
 * @returns [x, y, z] ECEF metres (plain number tuple — kept in float64)
 */
export function geodeticToEcef(latDeg: number, lonDeg: number, altM = 0): [number, number, number] {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  // radius of curvature in the prime vertical
  const N = WGS84.a / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (N + altM) * cosLat * Math.cos(lon);
  const y = (N + altM) * cosLat * Math.sin(lon);
  const z = (N * (1 - WGS84_E2) + altM) * sinLat;
  return [x, y, z];
}

/**
 * ECEF metres → geodetic (lat, lon, altitude), via Bowring's closed form.
 * Included so tile/camera code can go both directions without a second source.
 */
export function ecefToGeodetic(x: number, y: number, z: number): { latDeg: number; lonDeg: number; altM: number } {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  const theta = Math.atan2(z * WGS84.a, p * WGS84_B);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const ep2 = (WGS84.a * WGS84.a - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
  const lat = Math.atan2(z + ep2 * WGS84_B * sinT * sinT * sinT, p - WGS84_E2 * WGS84.a * cosT * cosT * cosT);
  const sinLat = Math.sin(lat);
  const N = WGS84.a / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  // Altitude has TWO forms, and the usual one is singular at the poles.
  //
  // `p / cos(lat) - N` is exact away from the axis and collapses on it: at the
  // pole `p` is exactly 0 while `cos(90°)` is about 6e-17, so the quotient is 0
  // and the altitude comes back as `-N` — off by 6,399,593 m, with the latitude
  // still correct beside it. Measured, on the most obvious input a caller can
  // construct by hand: `ecefToGeodetic(0, 0, WGS84_B)`.
  //
  // The round-trip never caught it because `geodeticToEcef(90, 0, 0)` yields a
  // sub-nanometre x from `cos(90°)`, so `p` is tiny-but-non-zero and the normal
  // branch holds. Only a hand-built axis point reaches the singularity, which is
  // exactly the input a consumer of this package is most likely to type.
  //
  // Near the axis, use the polar form instead: |z| / |sin(lat)| - N(1 - e²).
  const alt = Math.abs(p) > 1
    ? p / Math.cos(lat) - N
    : Math.abs(z) / Math.abs(sinLat) - N * (1 - WGS84_E2);

  return { latDeg: lat * RAD2DEG, lonDeg: lon * RAD2DEG, altM: alt };
}

// ---------------------------------------------------------------------------
// Sun — a physically correct subsolar point, so the terminator is real
// ---------------------------------------------------------------------------
/**
 * Low-precision NOAA solar position: the point on Earth where the sun is directly
 * overhead ("subsolar point") for a given instant. Accurate to ~0.01°, which is
 * far finer than a screenshot can resolve — this is what makes the day/night
 * terminator correct for the current UTC rather than decorative.
 */
export function subsolarPoint(date: Date = new Date()): { latDeg: number; lonDeg: number } {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5; // Unix ms → Julian Day
  const n = jd - 2_451_545.0; // days since J2000.0
  const L = mod360(280.46 + 0.9856474 * n); // mean longitude, deg
  const g = mod360(357.528 + 0.9856003 * n) * DEG2RAD; // mean anomaly, rad
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG2RAD; // ecliptic longitude
  const epsilon = (23.439 - 0.0000004 * n) * DEG2RAD; // obliquity of the ecliptic
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const alpha = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)); // right ascension
  const gmst = mod360(280.46061837 + 360.98564736629 * n); // Greenwich mean sidereal time, deg
  const lonDeg = normalizeLon(alpha * RAD2DEG - gmst);
  return { latDeg: declination * RAD2DEG, lonDeg };
}

// ---------------------------------------------------------------------------
// Texture ↔ ECEF alignment for the display sphere
// ---------------------------------------------------------------------------
/**
 * three.SphereGeometry places its poles on ±Y and wraps the equirectangular
 * texture so that texture-lon 0 sits on local +X, lon −90° on +Z and the north
 * pole on +Y. Our world frame is ECEF, where lon 0 is +X, lon +90° is +Y and the
 * north pole is +Z. Solving M·local(lon,lat) = ecef(lat,lon) across those basis
 * points gives a *pure +90° rotation about X* (local +Y→+Z, +Z→−Y, +X→+X) — and
 * NO rotation about the pole. Any longitude offset here would shift the texture
 * out of the ECEF frame that the sun light and the coastline overlay both use,
 * putting the day/night terminator on the wrong continent. Verified by gate #1
 * (terminator over the subsolar point) and gate #5 (coastlines over land).
 */
export const SPHERE_TEXTURE_LON_OFFSET = 0;

// ---------------------------------------------------------------------------
function mod360(x: number): number {
  return ((x % 360) + 360) % 360;
}
function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
