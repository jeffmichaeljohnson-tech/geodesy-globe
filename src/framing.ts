/**
 * Aspect-aware camera framing. Pure math, no three or React, so it can be
 * tested directly.
 *
 * The tuned framing (2.7 Earth radii, 30° vertical FOV) is a snug HORIZONTAL
 * fit: at a 1.6 desktop aspect the globe subtends 43.5° against a 46.4°
 * horizontal field, so the limb sits just inside the left and right edges and
 * the poles crop. That is the intended look and the one the Wave 1a gate
 * screenshots passed on.
 *
 * Horizontal field shrinks with aspect, and nothing accounted for that. On a
 * phone held upright (390×844, aspect 0.462) the horizontal field is only 14.1°
 * while the globe still subtends 43.5° — three times the visible field.
 * Observed on a real iPhone and reproduced headless: no limb, no atmosphere
 * rim, no black space, reading as a blurry aerial photo rather than a planet.
 * That loses the whole premise in the orientation most people hold a phone.
 */

/** Aspect the framing was tuned at. A fixed point of `fitDistanceForAspect`. */
export const REF_ASPECT = 1.6;

/** Vertical field of view, matching the Canvas camera in App.tsx. */
export const FOV_Y_RAD = (30 * Math.PI) / 180;

/** Earth radii. Keeps an extremely narrow window from flying to infinity. */
export const MAX_FIT_DIST = 12;

const halfFovX = (aspect: number) => Math.atan(Math.tan(FOV_Y_RAD / 2) * aspect);

/**
 * Distance, in Earth radii, that preserves the globe's fraction of the
 * horizontal field at any aspect ratio.
 *
 * The fill fraction is DERIVED from the tuned values rather than written in as
 * a constant, so `REF_ASPECT` returns exactly `baseDist` and wide viewports are
 * unchanged. Never returns less than `baseDist`, so no aspect can crop tighter
 * than the framing that passed the gate — this only ever pulls back.
 *
 * ── IT MUST NOT TOUCH A REQUEST TO BE NEAR THE GROUND ───────────────────────
 * "Preserve the globe's fraction of the field" only means something while the
 * globe's disc still FITS in the field. Past that the arithmetic keeps producing
 * numbers and they stop being answers: at `baseDist` 1.0005 (3 km altitude)
 * `asin(1/baseDist)` is 88°, giving a fill of 3.8 — the globe should occupy 380%
 * of the horizontal field — and since this only ever pulls BACK, the camera was
 * shoved to 400+ km.
 *
 * That is not hypothetical and it was expensive. Every low-altitude deep link
 * (`?clat=&clon=&dist=`) used to check tilt and photoreal landed at 403–544 km in
 * a normal browser window while reporting the requested 3–30 km in the capture
 * harness — because that harness runs at 1280×800, an aspect of exactly
 * REF_ASPECT, where this function is a no-op by construction. Two people looked
 * at the same URL and saw different altitudes for a whole session.
 *
 * So the fit applies only where it has meaning: while the disc fits the reference
 * field, i.e. fill <= 1. Below that the request is "take me to this place", not
 * "frame the planet", and the honest answer is the distance that was asked for.
 * The tuned framing is unaffected — at the default 2.7 radii the fill is 0.937.
 */
export function fitDistanceForAspect(aspect: number, baseDist: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return baseDist;
  if (!Number.isFinite(baseDist) || baseDist <= 1) return baseDist;

  const fill = Math.asin(1 / baseDist) / halfFovX(REF_ASPECT);
  // The globe already over-fills the reference field: there is no fraction left
  // to preserve, and this is a near-ground framing request.
  if (fill >= 1) return baseDist;
  const targetHalfAngle = halfFovX(aspect) * fill;
  if (!(targetHalfAngle > 0)) return baseDist;

  const fitted = 1 / Math.sin(Math.min(targetHalfAngle, Math.PI / 2 - 1e-9));
  return Math.max(baseDist, Math.min(fitted, MAX_FIT_DIST));
}
