/**
 * pitchCommand.ts — a one-slot mailbox from the tilt control to the camera rig.
 *
 * The button lives in the DOM and the camera lives in the frame loop. A module
 * singleton is how the rest of this codebase crosses that boundary in the
 * direction that must NOT re-render anything (worldOrigin does the same): routing
 * a pitch request through React state would re-render the Canvas subtree on every
 * tap, and the camera would have to read it back out of a prop anyway.
 *
 * ONE SLOT, LAST WRITE WINS. Taps arrive far faster than the eased move
 * completes, and queueing them would make the control feel like it was replaying
 * a backlog — tap 2D three times and watch it walk the cycle three times over.
 * The most recent intent is the only one anybody wants.
 *
 * The rig CONSUMES the request (takes and clears it), so a request is acted on
 * exactly once even though the frame loop runs at 60 Hz.
 */

let pending: number | null = null;

/** Ask the camera to ease to this pitch, in degrees. Replaces any unread request. */
export function requestPitch(deg: number): void {
  pending = deg;
}

/** Take the pending request, clearing it. Returns null when there is nothing new. */
export function takePitchRequest(): number | null {
  const p = pending;
  pending = null;
  return p;
}

/** Drop any unread request — used when the anchor is released and a pitch would have nothing to act on. */
export function clearPitchRequest(): void {
  pending = null;
}
