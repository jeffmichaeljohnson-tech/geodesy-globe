/**
 * flyCommand.ts — a one-slot mailbox from the DOM to the camera, for whole journeys.
 *
 * The direct sibling of `pitchCommand.ts`, and deliberately a SECOND small module
 * rather than a generalised command bus. This repo's stated principle is "three similar
 * lines > premature abstraction", and the two commands share nothing but their shape:
 * a pitch is one number the rig eases toward, a flight is a destination the rig travels
 * to over a fixed time. Merging them would mean a discriminated union and a switch, to
 * save about fifteen lines.
 *
 * The same reasoning as pitchCommand applies to why it is a module singleton at all:
 * the controls live in the DOM and the camera lives in the frame loop, and routing a
 * request through React state would re-render the Canvas subtree on every tap — which
 * is exactly what a camera move must not cost.
 *
 * ONE SLOT, LAST WRITE WINS. Someone who taps "go to the globe" and then immediately
 * "go back down" means the second thing. Queueing would fly them out and back while
 * they watched, which reads as the control being broken rather than obeyed.
 *
 * The rig CONSUMES the request, so a flight begins exactly once even though the frame
 * loop runs at 60 Hz.
 */

/** Why a flight was asked for. Surfaced in metrics so a capture can say what it saw. */
import type { FlyEase } from './easing';

export type FlyReason =
  /** First fix after the visitor allowed location — the app's "dramatic homecoming". */
  | 'homecoming'
  /** The globe/ground control, descending to what is centred. */
  | 'to-ground'
  /** The globe/ground control, pulling back out to the whole Earth. */
  | 'to-globe'
  /** The crosshairs control — return to the visitor's own location. */
  | 'recenter';

export interface FlyRequest {
  /** Destination latitude in degrees. */
  latDeg: number;
  /** Destination longitude in degrees. */
  lonDeg: number;
  /** Destination altitude above the surface, in METRES. */
  altitudeM: number;
  /**
   * How long the journey should take. Distance-tiered by `geo/homecoming.ts` so the
   * felt length matches the real one, exactly as the app does it.
   */
  durationMs: number;
  reason: FlyReason;
  /**
   * Which curve to fly. Defaults to 'journey' (easeInOutCubic) so the homecoming is
   * unchanged. A move that ANSWERS A PRESS must pass 'control', or it appears to lag
   * — easeInOutCubic covers 0.18% of the distance in the first 100 ms of a zoom, and
   * a person who just tapped reads that as the app not responding. See geo/easing.ts.
   */
  ease?: FlyEase;
}

let pending: FlyRequest | null = null;

/** Ask the camera to fly somewhere. Replaces any request it has not started yet. */
export function requestFly(request: FlyRequest): void {
  pending = request;
}

/** Take the pending request, clearing it. Returns null when there is nothing new. */
export function takeFlyRequest(): FlyRequest | null {
  const p = pending;
  pending = null;
  return p;
}

/**
 * Drop an unread request.
 *
 * Used when something with a stronger claim on the camera arrives — a prayer permalink
 * or a search result — so a homecoming queued a moment earlier cannot land on top of
 * the thing the visitor actually asked to see.
 */
export function clearFlyRequest(): void {
  pending = null;
}
