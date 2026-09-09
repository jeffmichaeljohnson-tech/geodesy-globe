/**
 * geodesy.ts — the geodetic frame for a real-scale Earth globe (renderer-bound layer).
 *
 * THE ONE NON-NEGOTIABLE ARCHITECTURAL DECISION lives here: the world/render
 * frame is **ECEF metres at real Earth scale**, not a unit "art sphere". Every
 * position on Earth is expressed in Earth-Centred-Earth-Fixed coordinates
 * (X through the prime-meridian/equator intersection, Z through the north pole,
 * right-handed, metres). three.js runs in float32, and at planet scale float32
 * carries metres of jitter at ground level — so all geodetic maths here are done
 * in JS doubles (float64) and only the *rebased* result (position minus a nearby
 * origin) is ever handed to the GPU. See {@link OriginRebase}.
 *
 * This is what keeps a future descent to street level from being a rewrite:
 * the scene is already in real coordinates; later work only has to move the
 * rebasing origin closer to the camera and stream tile meshes into the same frame.
 *
 * ── SPLIT FOR CODE-SPLITTING ────────────────────────────────────────────────
 * The pure float64 maths and constants (geodeticToEcef, ecefToGeodetic,
 * subsolarPoint, the WGS84 constants, EARTH_MEAN_RADIUS, SPHERE_TEXTURE_LON_OFFSET)
 * live in {@link ./geodesyMath} and are re-exported below unchanged, so every
 * existing importer of './geodesy' keeps working. Only the helpers that touch
 * three.js types — OriginRebase, sunDirectionEcef, sphereToEcefMatrix — are defined
 * here. Entry-chunk code that needs only the maths imports from geodesyMath directly
 * and never pulls `three/webgpu` into the initial bundle.
 */

import { Matrix4, Vector3 } from 'three/webgpu';
import { SPHERE_TEXTURE_LON_OFFSET, geodeticToEcef, subsolarPoint } from './geodesyMath';

// Re-export the three-free core so `from './geodesy'` continues to resolve every
// symbol it used to. The renderer-bound helpers below are the only additions.
export * from './geodesyMath';

// ---------------------------------------------------------------------------
// Origin rebasing — the float64 → float32 hand-off
// ---------------------------------------------------------------------------
/**
 * Holds a float64 rendering origin (an ECEF point) and converts absolute ECEF
 * positions into small float32 offsets relative to it. Today the origin sits at
 * Earth's centre (fine for an orbital view); when the camera descends the origin
 * is moved onto the surface under it so ground geometry keeps sub-millimetre
 * precision. The scene graph never sees absolute planet-scale coordinates.
 */
export class OriginRebase {
  /** the float64 origin, ECEF metres */
  readonly origin: [number, number, number];

  constructor(origin: [number, number, number] = [0, 0, 0]) {
    this.origin = [origin[0], origin[1], origin[2]];
  }

  /** Move the rendering origin (float64). Call when the camera crosses a rebasing threshold. */
  setOrigin(x: number, y: number, z: number): void {
    this.origin[0] = x;
    this.origin[1] = y;
    this.origin[2] = z;
  }

  /** Absolute ECEF (float64) → render-frame float32 Vector3 (subtraction done in float64). */
  toRender(ecef: readonly [number, number, number], out = new Vector3()): Vector3 {
    return out.set(ecef[0] - this.origin[0], ecef[1] - this.origin[1], ecef[2] - this.origin[2]);
  }

  /** Convenience: geodetic → render-frame float32 Vector3. */
  geodeticToRender(latDeg: number, lonDeg: number, altM = 0, out = new Vector3()): Vector3 {
    return this.toRender(geodeticToEcef(latDeg, lonDeg, altM), out);
  }
}

// ---------------------------------------------------------------------------
// Sun direction in the render frame
// ---------------------------------------------------------------------------
/** Unit sun direction in the ECEF/world frame for the given instant. */
export function sunDirectionEcef(date: Date = new Date(), out = new Vector3()): Vector3 {
  const { latDeg, lonDeg } = subsolarPoint(date);
  const e = geodeticToEcef(latDeg, lonDeg, 0);
  return out.set(e[0], e[1], e[2]).normalize();
}

// ---------------------------------------------------------------------------
// Texture ↔ ECEF alignment for the display sphere (matrix form)
// ---------------------------------------------------------------------------
/** Builds the local→ECEF rotation matrix for the display sphere. */
export function sphereToEcefMatrix(): Matrix4 {
  const rotX = new Matrix4().makeRotationX(Math.PI / 2); // local +Y (north) → world +Z
  if (SPHERE_TEXTURE_LON_OFFSET === 0) return rotX;
  const rotZ = new Matrix4().makeRotationZ(SPHERE_TEXTURE_LON_OFFSET);
  return new Matrix4().multiplyMatrices(rotZ, rotX);
}
