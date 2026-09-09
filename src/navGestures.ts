/**
 * navGestures.ts — what a drag MEANS, which depends on how far away you are.
 *
 * ── THE COMPLAINT, AND WHY IT WAS HALF RIGHT ─────────────────────────────────
 *
 * JJ: "when I click my mouse on the screen and drag it TO MOVE AROUND IT CONTROLS
 * THE TILT, and when I drag two fingers up or down it zooms in and out. I feel
 * like two finger drags should move you around the map navigation wise."
 *
 * The controls were never changed — those are OrbitControls' defaults (LEFT is
 * ROTATE, the wheel is DOLLY). What changed is the CAMERA, and that is the whole
 * insight:
 *
 *   OrbitControls always orbits its TARGET, and this rig moves the target with
 *   altitude. Up in orbit the target is Earth's centre, so a drag swings the
 *   camera around the planet and reads as SPINNING THE GLOBE — navigation, and
 *   exactly right. Down low a ground anchor latches on the surface beneath you
 *   (see cameraTarget.ts `groundPivotFactor`), so the very same drag swings the
 *   camera around THAT point and reads as TILTING.
 *
 * One mapping, two meanings, decided by where you happen to be. That is why it
 * felt wrong only sometimes, and why a single global remap would not fix it.
 *
 * ── THE MAPPING ──────────────────────────────────────────────────────────────
 *
 *                  orbital                    near the ground
 *   one-finger     spin the globe             pan the map
 *   two-finger     zoom                       pan the map
 *   pinch          zoom                       zoom
 *   shift / right  swing the view             swing the view
 *
 * At every altitude a one-finger drag NAVIGATES, which is the complaint.
 *
 * ── AND A CORRECTION, BECAUSE THE MEASUREMENT DISAGREED WITH THE PLAN ────────
 *
 * The modifier was going to be called "tilt". It is not, and measuring is what
 * caught it: with pitch settled at exactly 45, a shift-drag and a plain drag BOTH
 * moved the measured pitch by 1.60 degrees — identical. Not a coincidence and not
 * the gesture: the rig's pitch controller REWRITES pitch every frame toward the
 * value `requestPitch` last asked for (CameraRig sets `pitchDeg` from `want`), so
 * no drag of any kind can change pitch. It never could.
 *
 * What a drag around a latched anchor actually changes is HEADING — which way is
 * up and which side you are looking from. That swing is what reads as "it tilts"
 * when you only wanted to move, and it is genuinely what was being complained
 * about; it was simply never pitch.
 *
 * So: PITCH belongs to the tilt control and to arrivals, which is the whole reason
 * that control exists. The modifier swings the view. Calling it "tilt" in the code
 * would have been a comment asserting behaviour the code does not have — the
 * exact defect this repo keeps finding — so the name says swing.
 *
 * The `tilt` action name is kept in the type because it is what the gesture MAPS
 * to (ROTATE rather than PAN); only the human-facing description is corrected.
 *
 * ── WHY TWO-FINGER SCROLL STILL ZOOMS UP IN ORBIT ────────────────────────────
 *
 * It was tempting to make it spin the globe for consistency. Two reasons not to.
 *
 * First, every map application zooms on scroll at planet scale — Google Earth,
 * Google Maps and Mapbox all do — and when the whole Earth is in frame, getting
 * closer is almost always what the gesture is for.
 *
 * Second, and more honestly: spinning from wheel deltas means hand-rolling
 * spherical arithmetic, and this rig runs with NORTH (+Z) AS UP while three's
 * Spherical assumes Y. OrbitControls handles that with an internal quaternion it
 * does not expose. Reimplementing it inside the file that owns every flight, to
 * change a gesture nobody complained about, is a bad trade. The complaint was at
 * 2 km altitude, and that is the case this fixes.
 *
 * ── WHY NOT THREE-FINGER DRAG FOR TILT ───────────────────────────────────────
 *
 * It was suggested and it is a reasonable idea, but macOS claims three-finger
 * drag for Mission Control, app switching, and the accessibility drag setting, so
 * a browser usually never receives it. A gesture that works on some machines and
 * silently does nothing on others is worse than no gesture. Shift-drag is what
 * Google Earth uses for tilt, so it is the least surprising alternative, and
 * right-drag is offered alongside it for a mouse.
 *
 * ── WHY PINCH STAYS ZOOM ─────────────────────────────────────────────────────
 *
 * A trackpad pinch arrives as a `wheel` event with `ctrlKey` true — that is how
 * browsers encode it, not a modifier anyone is holding. So pinch and two-finger
 * scroll ARE distinguishable, which is what makes this split possible at all.
 * Every map application treats pinch as zoom; keeping it costs nothing and
 * breaking it would surprise everyone.
 *
 * The functions below are the pure arithmetic, so the mapping can be tested
 * without a GPU, a canvas, or a camera.
 */

/** What a pointer or wheel gesture should do, given where the camera is. */
export type NavAction = 'spin' | 'pan' | 'zoom' | 'tilt';

export interface GestureInput {
  /** True once a ground anchor is latched — the rig's own `tiltAvailable` signal. */
  readonly groundAnchored: boolean;
  /** True when the browser flagged this wheel event as a pinch (`ctrlKey`). */
  readonly pinch?: boolean;
  /** True when shift is held, or the right button is dragging. */
  readonly tiltModifier?: boolean;
}

/**
 * What a WHEEL gesture should do. Separate from the pointer decision because the
 * two genuinely differ up in orbit: a drag spins the globe, a scroll zooms.
 *
 * A trackpad pinch arrives as a wheel event with `ctrlKey` set — that is the
 * browser's encoding, not a key anyone is holding — so pinch always zooms.
 */
export function wheelActionFor(g: GestureInput): NavAction {
  if (g.pinch) return 'zoom';
  return g.groundAnchored ? 'pan' : 'zoom';
}

/**
 * The single decision this module exists to make.
 *
 * Order matters and is deliberate: an explicit tilt request beats everything,
 * because someone holding shift has said what they want; a pinch beats the
 * altitude rule, because zoom means zoom everywhere; and only then does the
 * globe-versus-map question apply.
 */
export function navActionFor(g: GestureInput): NavAction {
  if (g.tiltModifier) return 'tilt';
  if (g.pinch) return 'zoom';
  return g.groundAnchored ? 'pan' : 'spin';
}

/**
 * Metres of ground covered by one screen pixel, for a perspective camera.
 *
 * The visible height at the target's distance is `2 * d * tan(fov/2)`, so one
 * pixel is that divided by the viewport height. Panning by this makes the ground
 * track the pointer one-to-one, which is the property that makes a map feel like
 * paper under a finger rather than a slider.
 */
export function metresPerPixel(distanceM: number, fovYRad: number, viewportPx: number): number {
  if (viewportPx <= 0) return 0;
  return (2 * distanceM * Math.tan(fovYRad / 2)) / viewportPx;
}

/**
 * How far a wheel-driven pan should move, in metres.
 *
 * Wheel deltas are not pixels — `deltaMode` distinguishes pixels (0), lines (1)
 * and pages (2), and a line on a trackpad is worth roughly 16 px. Ignoring that
 * makes the same gesture move wildly different distances between browsers, which
 * is a classic source of "it feels wrong on my machine".
 */
export function wheelPanMetres(
  delta: number,
  deltaMode: number,
  distanceM: number,
  fovYRad: number,
  viewportPx: number,
): number {
  const LINE_PX = 16;
  const PAGE_PX = 800;
  const px = deltaMode === 1 ? delta * LINE_PX : deltaMode === 2 ? delta * PAGE_PX : delta;
  return px * metresPerPixel(distanceM, fovYRad, viewportPx);
}
