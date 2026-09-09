/**
 * homecoming.ts — flying the camera to the visitor's own location, the way the app does.
 *
 * WHAT THIS MIRRORS, AND WHY THE NUMBERS ARE COPIED RATHER THAN INVENTED
 *
 * The iOS app calls this "the dramatic homecoming": on first fix it flies the map
 * from a default view to the person's own location, and the flight's LENGTH is
 * chosen by DISTANCE so the felt journey matches the real one — a neighbour is a
 * quick hop, another continent is cinematic. The same trip is also played as a
 * haptic of matching length, which is why the duration is a shared constant there
 * rather than a magic number at the call site.
 *
 * Source of the four constants below — `apps/mobile/app/(tabs)/index.tsx` and
 * `apps/mobile/lib/haptics/vocabulary.ts`:
 *
 *     const tier = km < 150 ? 'near' : km < 1200 ? 'med' : 'far';
 *     export const FLY_DURATIONS = { near: 1300, med: 2000, far: 2800 } as const;
 *
 * They are RESTATED here, not imported: the web app does not build against the
 * Expo app's module graph, and a copy that says where it came from is honest,
 * whereas a second set of invented numbers would silently make the two products
 * feel different. `homecoming.test.ts` pins these values so a drift is a failing
 * test rather than a slow divergence nobody notices.
 */

/**
 * A point in **Mapbox axis order: longitude first, then latitude.**
 *
 * This is the odd one out in this package and the label is load-bearing. Every
 * other function here takes latitude first -- `geodeticToEcef(latDeg, lonDeg)`,
 * `centralAngle(aLatDeg, aLonDeg, ...)`, `isDrawablePoint(lat, lng)` -- because
 * they are geodesy. These two take `[lng, lat]` because they mirror a Mapbox
 * call site, and changing them to match would make this file disagree with the
 * app it was copied from, which is the drift the header exists to prevent.
 *
 * A bare `[number, number]` gave the compiler nothing: a `[lat, lng]` passed by
 * mistake type-checks, returns a plausible number, and is wrong silently. The
 * labels surface as `[lng: number, lat: number]` in editor hints and on every
 * signature below, so the order is visible where the call is written rather than
 * only in a comment two screens up. It costs nothing at runtime -- a labelled
 * tuple is the same tuple.
 */
export type LngLat = [lng: number, lat: number];

/** Great-circle distance in km between two [lng, lat] points (Mapbox axis order). */
export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type FlyTier = 'near' | 'med' | 'far';

/** Flight length per tier, in ms. Copied from the app — see the header. */
export const FLY_DURATIONS: Record<FlyTier, number> = {
  near: 1300,
  med: 2000,
  far: 2800,
};

/** Tier boundaries in km. Copied from the app — see the header. */
export const FLY_TIER_NEAR_KM = 150;
export const FLY_TIER_MED_KM = 1200;

/**
 * Pick a flight tier by distance, exactly as the app does. Returns the duration
 * alongside the tier so a caller cannot pair one tier's name with another's length.
 */
export function flyTierFor(
  from: LngLat,
  to: LngLat,
): { tier: FlyTier; durationMs: number } {
  const km = haversineKm(from, to);
  const tier: FlyTier = km < FLY_TIER_NEAR_KM ? 'near' : km < FLY_TIER_MED_KM ? 'med' : 'far';
  return { tier, durationMs: FLY_DURATIONS[tier] };
}

/**
 * Camera altitude, in metres, that frames a given ground extent at a given
 * vertical field of view. The globe camera is a plain perspective camera, so the
 * half-extent is the opposite side of a right triangle whose adjacent side is the
 * altitude:  tan(fov/2) = (extent/2) / altitude.
 *
 * This exists so the arrival altitude can be expressed as "show roughly this much
 * ground", which is a product decision anyone can reason about, rather than as a
 * bare number of metres that only makes sense next to one particular fov.
 */
export function altitudeForGroundExtentKm(extentKm: number, fovYRad: number): number {
  return ((extentKm * 1000) / 2) / Math.tan(fovYRad / 2);
}

/**
 * The ground extent the app shows on arrival.
 *
 * The app arrives at Mapbox `zoomLevel: 10`. At zoom 10 a typical phone viewport
 * spans very roughly 40 km of ground, which is the "your city and its
 * surroundings" framing — near enough to feel personal, wide enough that a lone
 * marker is not the only thing on screen.
 *
 * ⚠️ COST NOTE, and the reason this is a named constant rather than inline:
 * Google's photorealistic 3D tiles engage at and below `PHOTOREAL_ENGAGE_KM`
 * (2000 km altitude — see globe/tiles3dGeo.ts), and Google bills the ROOT TILESET
 * REQUEST, one per session that engages them. A 40 km-extent arrival sits far
 * below that line, so an automatic homecoming makes EVERY first visit a billable
 * 3D-tiles session. That is a deliberate product choice, not an oversight: raising
 * this figure above a ~1070 km extent (the extent at 2000 km altitude for this
 * fov) would make the intro free and leave photoreal to engage only when the
 * visitor deliberately descends. Change this one number to move that line.
 */
export const ARRIVAL_GROUND_EXTENT_KM = 40;

/**
 * WHERE TO STOP WHEN THERE ARE NO PHOTOREAL TILES TO ARRIVE ON.
 *
 * The 40 km arrival assumes Google's 3D tiles are there to meet it. When they are
 * not -- no API key, the host unreachable, or the daily quota spent by earlier
 * visitors -- the only thing left to draw is the 4096 px earth texture, and at
 * 74.6 km that texture is magnified roughly two hundred times.
 *
 * MEASURED, by blocking tile.googleapis.com and flying to Detroit at each height
 * (scripts/globe/fly-check.mjs --block=tile.googleapis.com):
 *
 *     74.6 km   an unrecognisable brown and purple smear. Not a place.
 *      800 km   mush; a coastline barely implied.
 *     1600 km   the Great Lakes plainly readable. It reads as somewhere.
 *
 * So 1600. This is NOT a quality setting -- it is the height at which the fallback
 * basemap still says "this is Earth, and this is your part of it". Arriving lower
 * does not show the visitor less detail; it shows them nothing, while looking like
 * it worked. Silent degradation dressed as the product is the failure mode this
 * codebase keeps finding, and a first visit is the worst place to ship one.
 *
 * The cost is the tilt: an anchor latches only below 400 km, so a fallback arrival
 * is necessarily top-down. An untilted legible continent beats a tilted smear.
 */
export const LEGIBLE_FALLBACK_ALT_KM = 1600;

/**
 * True when photoreal tiles can actually be expected to draw.
 *
 * Reads the status string Tiles3D already publishes rather than adding a second
 * notion of "working" that could drift from it -- the same rule ViewToggle follows
 * with `tiltAvailable`. Both failure shapes it emits ("no key -- buildings off",
 * "<host> unreachable -- buildings off (...)") mean the same thing here: nothing
 * will be there when we land.
 *
 * Unknown or empty status is treated as AVAILABLE. Tiles report failure only after
 * trying, so an empty string usually means "not asked yet"; assuming failure would
 * strand every visitor at 1600 km on a perfectly healthy day.
 *
 * ⚠️ WHAT THIS DOES NOT COVER, and it is the case worth naming.
 *
 * Tiles engage at 2000 km, so on a day when the KEY IS VALID BUT THE QUOTA IS SPENT
 * the status is still empty while the camera is orbital -- and the very first
 * descent therefore aims at 74.6 km and lands on the smear anyway. The load-error
 * fires on the way down, so every flight AFTER that one is corrected, including the
 * recenter and the view toggle a puzzled visitor is likely to press next.
 *
 * Closing that first flight properly means watching for the failure MID-DESCENT and
 * ending the tween high, which is a change inside CameraRig's frame loop -- the one
 * file where a mistake breaks the flight for everybody. It is deliberately not done
 * here on the way past. This function fixes the no-key case completely and the
 * spent-quota case from the second flight onward; the first flight on a spent-quota
 * day remains open, and is not claimed as fixed.
 */
export function photorealAvailableFrom(tiles3dStatus: string | undefined | null): boolean {
  if (!tiles3dStatus) return true;
  const s = tiles3dStatus.toLowerCase();
  // 'buildings off' covers every failure wording Tiles3D emits, including the
  // referrer-block phrasing added after a 403 was found masquerading as a TypeError.
  return !(s.includes('unreachable') || s.includes('no key')
    || s.includes('not allowed') || s.includes('buildings off'));
}

/** The altitude a flight should aim for, given whether photoreal will be there. */
export function arrivalAltitudeM(fovYRad: number, photorealAvailable: boolean): number {
  return photorealAvailable
    ? altitudeForGroundExtentKm(ARRIVAL_GROUND_EXTENT_KM, fovYRad)
    : LEGIBLE_FALLBACK_ALT_KM * 1000;
}

/**
 * Easing for the flight. `easeInOutCubic` — accelerate away from the old view,
 * decelerate into the new one — which is the shape Mapbox's `flyTo` traces and
 * matches the globe's existing "Breath" motion language (weighted, decelerating)
 * rather than a linear slide, which reads as mechanical.
 */
export function easeFly(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Everything that has to be true before the camera flies home.
 *
 * The app gates its own homecoming on four conditions at `app/(tabs)/index.tsx:483` —
 * a position exists, the map is ready, it has not already flown this mount, and no
 * deep-link target is pending. All four port. The web adds two of its own.
 */
export interface HomecomingGate {
  /** A geolocation fix has arrived. */
  hasPosition: boolean;
  /** The globe has finished its first paint. */
  mapReady: boolean;
  /** The camera has already flown home once this mount. */
  alreadyFlew: boolean;
  /**
   * A permalink or a search result is framing the camera.
   *
   * The app checks one source (`pendingViewPrayerId`); the web has TWO, because
   * `App.tsx` resolves `focus={searchFocus ?? permalinkFocus}`. Someone who arrived at
   * a specific prayer, or who just searched a place, is being shown a thing they asked
   * for — a homecoming must never take the camera off it.
   */
  focusActive: boolean;
  /** `?nofly=1`, so captures stay deterministic and cannot trigger a billable descent. */
  disabled: boolean;
}

/** True only when every gate is open. */
export function shouldFlyHome(g: HomecomingGate): boolean {
  return g.hasPosition && g.mapReady && !g.alreadyFlew && !g.focusActive && !g.disabled;
}

/**
 * Whether a permission-state change should trigger a FRESH position fetch.
 *
 * WHY THIS EXISTS — the late-grant hole shouldFlyHome cannot see.
 *
 * The homecoming fires the instant a position arrives (App resolves it from a
 * geolocation fix). shouldFlyHome is stateless, so it is already correct for a late
 * grant: give it a position and it flies. The bug is one layer down — a position may
 * never ARRIVE.
 *
 * useGeolocation asks for a fix exactly once, with a one-shot getCurrentPosition. If
 * the visitor answers THAT prompt, its success callback delivers the position and the
 * flight happens. But a browser also lets someone grant location from its own chrome —
 * the address-bar icon or site settings — AFTER the prompt was dismissed or ignored.
 * That path flips the permission to `granted` and fetches nothing, so the camera never
 * comes home. JJ's report was "logged in, THEN allowed location, and it did nothing";
 * this is the shape of it that survives once ?nofly is ruled out.
 *
 * So useGeolocation watches the PermissionStatus for a change and asks again when this
 * returns true. The predicate is pure and lives here, beside the gate it completes, so
 * a test pins the exact transitions that refetch and a regression is a red test rather
 * than a silent return to "nothing happened".
 *
 * `havePosition` guards against re-asking when a fix is already in hand — a redundant
 * getCurrentPosition would be a battery cost with nothing new to learn.
 */
export function shouldFetchOnPermission(
  state: 'granted' | 'prompt' | 'denied',
  havePosition: boolean,
): boolean {
  return state === 'granted' && !havePosition;
}
