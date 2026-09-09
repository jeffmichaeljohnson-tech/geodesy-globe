/**
 * cameraPitch.ts — tilt, as an angle that can be measured, set and clamped.
 *
 * ── THE BUG THIS EXISTS TO FIX ──────────────────────────────────────────────
 * Tilt did not work, and could not, by construction. CameraRig recomputed the
 * orbit pivot EVERY FRAME as a point along the camera's own radial line from
 * Earth's centre:
 *
 *   _pivot = normalize(camera - centre) * pivotR + centre
 *   controls.target = _pivot
 *
 * Looking at a point on your own radial IS looking straight down. A drag did
 * rotate the camera — verified with a real 250 px drag over CDP at 3 km, which is
 * about 45 degrees of polar rotation at rotateSpeed 0.4 — but the next frame put
 * the pivot back underneath the camera's new position and the view snapped to
 * nadir again. The pivot chased the camera. Before and after were different parts
 * of Manhattan at an identical 3 km altitude, both looking straight down.
 *
 * The original reasoning held that moving the pivot does not rotate the view,
 * because the centre and the ground point beneath the camera lie on the same ray.
 * That is true at the instant of the move. It also means the camera can never
 * RETAIN a tilt, which is the part that was missed, and it held at every altitude
 * because pivotRadiusFor only varies how far down the radial the pivot sits —
 * never that it is on the radial.
 *
 * ── THE MODEL ───────────────────────────────────────────────────────────────
 * The camera orbits a FIXED ground anchor. Pitch is then a real quantity: the
 * angle between the camera's offset from that anchor and local up at the anchor.
 *
 *   pitch 0   camera directly overhead, looking straight down   ("2D")
 *   pitch 55  the curated tilted view                           ("3D")
 *   pitch 85  maximum tilt, just short of the horizon           ("MAX")
 *
 * These are the mobile app's angles, unchanged — PITCH_FLAT / PITCH_TILTED /
 * PITCH_MAX in apps/mobile/app/(tabs)/index.tsx. The web deliberately does not
 * invent its own, because the two surfaces are one product.
 *
 * ── WHY 85 AND NOT 90 ───────────────────────────────────────────────────────
 * At 90 degrees the camera is exactly on the anchor's horizon plane; past it, it
 * is underground. 85 leaves the horizon visible with the camera still above the
 * surface, and it is the same stop the phone uses, so the two feel alike.
 *
 * Plain arrays rather than three's Vector3, matching geodesy.ts, so this is pure
 * and testable in a node environment with no renderer.
 */

export type Vec3 = [number, number, number];

/** Overhead. The map reads as a plan view. */
export const PITCH_FLAT_DEG = 0;
/** The curated tilted view. */
export const PITCH_TILTED_DEG = 55;
/** Maximum tilt — horizon visible, camera still above ground. */
export const PITCH_MAX_DEG = 85;
/**
 * Below this the camera counts as "flat" when deciding where the next tap goes.
 * Mobile's TILT_THRESHOLD, for the same reason: a camera left at 0.4 degrees by a
 * stray drag must still offer "3D" as the next stop, not "MAX".
 */
export const TILT_THRESHOLD_DEG = 10;

/** The three stops, in the order a repeated tap walks them. */
export const PITCH_STOPS = [PITCH_FLAT_DEG, PITCH_TILTED_DEG, PITCH_MAX_DEG] as const;

const DEG = 180 / Math.PI;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

/**
 * The camera's pitch, in degrees, given its offset from the anchor and local up
 * at that anchor.
 *
 * 0 is directly overhead and 90 is on the horizon plane. Returns 0 for a
 * degenerate (zero-length) offset or up, because "no offset" has no meaningful
 * angle and 0 is the value that makes the caller's clamp a no-op.
 */
export function pitchDegFor(offset: Vec3, up: Vec3): number {
  const lo = length(offset);
  const lu = length(up);
  if (lo === 0 || lu === 0) return 0;
  // Clamped before acos: floating error can push the quotient a hair past ±1,
  // and acos of 1.0000000002 is NaN — which would silently disable the clamp
  // that keeps the camera above ground.
  const c = Math.min(1, Math.max(-1, dot(offset, up) / (lo * lu)));
  return Math.acos(c) * DEG;
}

/** Confine a pitch to the reachable band. */
export function clampPitchDeg(deg: number): number {
  if (!Number.isFinite(deg)) return PITCH_FLAT_DEG;
  return Math.min(PITCH_MAX_DEG, Math.max(PITCH_FLAT_DEG, deg));
}

/**
 * Where the next tap should take the camera, mirroring the phone exactly.
 *
 *   flat        -> tilted (3D)
 *   tilted      -> max
 *   at/past max -> flat (2D)
 *
 * The midpoint test between tilted and max is mobile's, so a camera parked at any
 * angle in between resolves the same way on both surfaces.
 */
export function nextPitchStop(currentDeg: number): number {
  if (!Number.isFinite(currentDeg) || currentDeg < TILT_THRESHOLD_DEG) return PITCH_TILTED_DEG;
  if (currentDeg < (PITCH_TILTED_DEG + PITCH_MAX_DEG) / 2) return PITCH_MAX_DEG;
  return PITCH_FLAT_DEG;
}

/**
 * The label for a control that names WHERE THE NEXT TAP GOES rather than where
 * you are — mobile's choice, and the reason the control explains itself without
 * a legend.
 */
export function pitchLabelFor(nextStop: number): '2D' | '3D' | 'MAX' {
  if (nextStop === PITCH_TILTED_DEG) return '3D';
  if (nextStop === PITCH_MAX_DEG) return 'MAX';
  return '2D';
}

/**
 * A new camera offset at `pitchDeg`, preserving distance and heading.
 *
 * The offset is decomposed into its component along local up and its horizontal
 * remainder; the horizontal direction is the HEADING and is preserved, so tilting
 * never spins the view. Only the split between the two changes.
 *
 * `fallbackHorizontal` is used when the camera is (near enough) directly overhead
 * and therefore has no horizontal component to preserve — the azimuth is genuinely
 * undefined there, exactly like the pole of a spherical coordinate system. Pass
 * local north for a stable, geographically meaningful choice; without it a tilt
 * from dead overhead would pick an arbitrary direction and read as a lurch.
 */
export function offsetForPitch(
  offset: Vec3,
  up: Vec3,
  pitchDeg: number,
  fallbackHorizontal: Vec3,
): Vec3 {
  const d = length(offset);
  if (d === 0) return offset;
  const u = normalize(up);
  if (length(u) === 0) return offset;

  const along = dot(offset, u);
  let h: Vec3 = [offset[0] - u[0] * along, offset[1] - u[1] * along, offset[2] - u[2] * along];
  // A horizontal component this small is numerically meaningless — its direction
  // is dominated by rounding, so normalising it would produce a random heading.
  if (length(h) < d * 1e-6) {
    const f = normalize(fallbackHorizontal);
    const fAlong = dot(f, u);
    h = [f[0] - u[0] * fAlong, f[1] - u[1] * fAlong, f[2] - u[2] * fAlong];
    // Degenerate fallback too (it was parallel to up): leave the offset alone
    // rather than emit a zero vector, which would collapse the camera onto the
    // anchor and blank the screen.
    if (length(h) === 0) return offset;
  }
  const hn = normalize(h);

  const r = clampPitchDeg(pitchDeg) / DEG;
  const cu = Math.cos(r) * d;
  const ch = Math.sin(r) * d;
  return [u[0] * cu + hn[0] * ch, u[1] * cu + hn[1] * ch, u[2] * cu + hn[2] * ch];
}

/**
 * Where the camera belongs the instant a flight lands, given the nadir offset it landed
 * with and the pitch it is about to take.
 *
 * THE WHOLE POINT IS THAT THIS IS ONE STEP. A flight lands nadir above its anchor, so the
 * offset is purely vertical and its length IS the altitude; `offsetForPitch` preserves
 * length, so pitching would otherwise keep only cos(pitch) of the altitude just flown to.
 * Scaling by 1/cos(pitch) fixes that -- but ONLY if the rotation happens in the same step.
 *
 * Doing it in two steps parks the camera one frame at altitude h/cos(pitch), nadir, and
 * for any arrival at or above PIVOT_CENTRE_ALT_M * cos(pitch) that inflated value clears
 * the line where a ground anchor is released. The anchor then drops and the pitch request
 * is cleared before it is ever applied: a 338 km arrival landed at 478 km, un-tilted.
 *
 * Returning the FINAL offset makes that mistake unavailable to a caller.
 */
export function arrivalOffsetForPitch(
  nadirOffset: Vec3,
  up: Vec3,
  pitchDeg: number,
  fallbackHorizontal: Vec3,
): Vec3 {
  const c = Math.cos(clampPitchDeg(pitchDeg) / DEG);
  // A pitch clamped to horizontal would divide by ~0 and hurl the camera to infinity.
  // clampPitchDeg already bounds the input, so this only guards a future wider clamp.
  if (!(c > 1e-3)) return offsetForPitch(nadirOffset, up, pitchDeg, fallbackHorizontal);
  const scaled: Vec3 = [nadirOffset[0] / c, nadirOffset[1] / c, nadirOffset[2] / c];
  return offsetForPitch(scaled, up, pitchDeg, fallbackHorizontal);
}
