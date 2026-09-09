/**
 * autoRotate.ts — how fast the globe drifts, and why that has to change on descent.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * One constant, `autoRotateSpeed = 0.12`, applied at every altitude. Verified
 * against the installed OrbitControls rather than assumed — it advances by
 * `(2π/60 × autoRotateSpeed) × deltaTime` radians, so 0.12 is 0.72°/s.
 *
 * The Earth turns at 360° per sidereal day: 0.00418°/s. The globe was drifting
 * about 172× faster than the planet it depicts.
 *
 * From orbit nobody minds — it reads as a slow, reverent turn, and it is the
 * motion language this product chose. At 75 km it is a landscape sliding past at
 * speed. JJ caught it and offered two options: stop rotating past some point, or
 * keep rotating at the Earth's actual speed to simulate a real Earth.
 *
 * ── THE DEEPER REASON IT MUST FADE, WHICH IS NOT ABOUT SPEED ────────────────
 * OrbitControls auto-rotation swings the camera around `controls.target`. While
 * the target is Earth's CENTRE, that is exactly "the globe is turning" — the
 * motion means what it looks like.
 *
 * On descent the target migrates to a latched ground anchor (see cameraTarget).
 * Auto-rotation then circles the camera around a point on the ground, which is
 * not the Earth rotating at all — it is the viewer being swung around a
 * neighbourhood. No choice of speed makes that gesture correct, so the artistic
 * drift has to fade out as the pivot leaves Earth's centre.
 *
 * ── AND WHY THE FLOOR IS THE REAL EARTH, NOT ZERO ───────────────────────────
 * It would be simpler to stop dead. It also would not be this product. The globe
 * never stops turning; it slows to the rate the Earth actually turns — which at
 * neighbourhood scale is imperceptible, and is the honest answer to "should it
 * stop or should it be real". Both of JJ's options converge here, and this one
 * is truthful about what it is depicting.
 *
 * Reusing `groundPivotFactor` rather than inventing a fourth altitude ramp: it is
 * already the smoothstep from orbit (400 km, pivot at Earth's centre) to a place
 * (60 km, pivot on the ground), and it is the very quantity that decides whether
 * auto-rotation means anything. Tilt, bloom threshold and this now share one
 * boundary, so they cannot drift apart.
 */
import { groundPivotFactor } from './cameraTarget';

/** Seconds in a sidereal day — one true rotation relative to the stars, not the sun. */
export const SIDEREAL_DAY_SECONDS = 86_164.0905;

/** The Earth's rotation, in degrees per second. About 0.00418. */
export const EARTH_DEG_PER_SEC = 360 / SIDEREAL_DAY_SECONDS;

/**
 * Radians per second produced by one unit of OrbitControls' `autoRotateSpeed`.
 * Read from the installed control, which advances `(2π/60 × speed) × dt`.
 */
export const RAD_PER_SEC_PER_SPEED_UNIT = (2 * Math.PI) / 60;

/**
 * The `autoRotateSpeed` that turns the globe at the Earth's true rate.
 * About 0.000696 — roughly 1/172 of the orbital drift.
 */
export const EARTH_TRUE_SPEED =
  (EARTH_DEG_PER_SEC * (Math.PI / 180)) / RAD_PER_SEC_PER_SPEED_UNIT;

/**
 * The tuned orbital drift: slow, weighted, deliberately unhurried.
 *
 * HALVED FROM 0.12 on 2026-08-21, at the opening altitude, on JJ's judgement that it
 * "goes a little too fast". 0.12 was 0.72°/s; this is 0.36°/s, so a full turn takes
 * about 16 minutes rather than 8.
 *
 * The number that made the case: the opening view is deliberately framed on the United
 * States, and at 0.72°/s the country left the centre of frame in roughly a minute —
 * measured at −98.6° on load, −109.7° at 25 s, −121.5° at 40 s. Every prayer and arc
 * currently sits in North America, so the drift was carrying the product's only content
 * to the limb while someone was still looking at it.
 *
 * THIS IS A DECISION ABOUT TODAY'S DATA, NOT A PERMANENT ONE. Once prayers are spread
 * worldwide, a faster turn is the honest presentation of a world map, and this should go
 * back up. Recorded so the next person knows it is a dial, not a discovery.
 *
 * Everything else about the ramp is unchanged: this is the ORBITAL end of it, altitude
 * still scales the perceived motion below the reference height, the drift still fades as
 * the pivot leaves Earth's centre, and the floor is still the Earth's true rate.
 */
export const ORBITAL_SPEED = 0.06;

/**
 * The altitude ORBITAL_SPEED was tuned at — the default framing, 2.7 Earth radii.
 *
 * ── WHY A REFERENCE ALTITUDE IS NEEDED AT ALL ───────────────────────────────
 * The first version scaled the ANGULAR rate and was still wrong, by a lot. JJ
 * judged three altitudes: the orbital view was right, the neighbourhood view was
 * right, and 257 km was "moving WAY too fast".
 *
 * He was right and the reason is that angular rate is not what anyone perceives.
 * What you see is ground sliding across the frame, and the visible ground width
 * shrinks in proportion to altitude — so an unchanged angular rate looks faster
 * and faster on the way down. Measured as a fraction of the frame per second:
 *
 *     14,378 km   0.86 % / s     the drift JJ approved
 *        257 km   13.9 % / s     the same ramp, sixteen times faster to the eye
 *
 * So the rate is scaled by altitude, which holds the PERCEIVED motion constant
 * instead of the angular one. Above the reference altitude it is capped, so the
 * signature orbital view keeps exactly the drift it was tuned with.
 */
export const REFERENCE_ALT_KM = 10_830.7; // EARTH_MEAN_RADIUS × (2.7 − 1), in km

/**
 * The auto-rotation speed to use at a given altitude.
 *
 * @param altitudeKm   camera altitude above the display sphere
 * @param orbitalSpeed the drift to use while fully orbital; overridable so the
 *                     rate can be compared side by side without a rebuild.
 */
export function autoRotateSpeedFor(altitudeKm: number, orbitalSpeed = ORBITAL_SPEED): number {
  // An unknown altitude must not produce a NaN speed: OrbitControls would advance
  // theta by NaN and the camera would vanish rather than merely spin wrongly.
  if (!Number.isFinite(altitudeKm)) return orbitalSpeed;

  // 1. Hold the PERCEIVED motion constant, not the angular rate. Capped at 1 so
  //    nothing above the reference altitude spins faster than the tuned drift.
  const perceptual = Math.min(1, Math.max(0, altitudeKm) / REFERENCE_ALT_KM);

  // 2. Then fade out entirely as the pivot leaves Earth's centre, because past
  //    that point the gesture stops meaning "the globe is turning" at any speed.
  const f = groundPivotFactor(altitudeKm * 1000);

  // 3. And never below the rate the Earth actually turns. The globe does not stop.
  return Math.max(EARTH_TRUE_SPEED, orbitalSpeed * perceptual * (1 - f));
}

/** Degrees per second actually produced by a given `autoRotateSpeed`, for reporting. */
export function degPerSecFor(autoRotateSpeed: number): number {
  return autoRotateSpeed * RAD_PER_SEC_PER_SPEED_UNIT * (180 / Math.PI);
}
