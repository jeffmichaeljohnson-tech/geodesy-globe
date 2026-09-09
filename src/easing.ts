/**
 * easing.ts — how a camera move BEGINS, which turns out to be the whole question.
 *
 * ── THE BUG THAT PRODUCED THIS FILE ──────────────────────────────────────────
 *
 * JJ pressed the zoom and the ground controls and reported "a slight delay before
 * the camera starts moving — it should be instant". He was right, and the cause is
 * arithmetic rather than anything asynchronous:
 *
 * Every flight used `easeFly`, which is easeInOutCubic. That curve has ZERO
 * VELOCITY AT t=0 — it accelerates from a standstill. On the 1300 ms 'near' tier a
 * zoom uses, the first 100 ms of the animation covers:
 *
 *     easeInOutCubic(100/1300) = 4 * 0.077^3 = 0.0018   ->  0.18% of the distance
 *
 * Two tenths of one percent. Nothing perceptible happens for roughly the first
 * 150 ms, and a person who has just pressed a button reads that as lag. There was
 * no delay in the code path at all — the mailbox is drained on the next frame — the
 * delay was drawn on purpose by the curve.
 *
 * ── WHY TWO CURVES, NOT ONE ──────────────────────────────────────────────────
 *
 * The mobile app already settled this and wrote it down (apps/mobile/CLAUDE.md):
 *
 *     withSpring ONLY for prayer/spiritual/map/feed animations
 *     All UI chrome uses withTiming + Easing.out(Easing.cubic)
 *
 * `Easing.out(Easing.cubic)` is precisely the fix: maximum velocity at t=0, then
 * decelerating into the destination. So the split is not a new invention, it is the
 * app's existing law applied to a surface that had missed it:
 *
 *   A CONTROL move answers a press.        -> easeControl, moves on the first frame.
 *   A JOURNEY move is a cinematic arrival.  -> easeFly, may take a breath first.
 *
 * The homecoming keeps `easeFly`. Nobody pressed a button for it, it begins on its
 * own after permission is granted, and a gentle departure from orbit is the point of
 * it. Zoom, the globe/ground toggle and recenter all answer a press, and get this.
 */

/**
 * easeOutCubic — fast at the start, decelerating into the destination.
 *
 * At t = 0 its derivative is 3, versus easeInOutCubic's 0. That single difference
 * is what turns "laggy" into "instant": 10% of the journey is covered in the first
 * 3.6% of the time, so the very first frame after the press shows real movement.
 *
 * Clamped, so a caller that overruns its own duration cannot drive the camera past
 * its destination and back.
 */
export function easeControl(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** Which curve a flight should use. See the file header for the rule. */
export type FlyEase = 'journey' | 'control';
