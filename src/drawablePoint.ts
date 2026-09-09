/**
 * drawablePoint.ts — the one place that decides whether a coordinate may be
 * drawn.
 *
 * This rule existed in three places: `isDrawable` in memorialArcs.ts, another
 * `isDrawable` in webPrayers.ts, and a `not (x = 0 and y = 0)` clause in SQL.
 * The SQL copy has to stay — the server must not send a bad point in the first
 * place — but the two client copies were the same rule written twice, and one of
 * them can quietly stop matching the other.
 *
 * WHY (0,0) IS REFUSED, since it looks like an ordinary coordinate:
 *
 *   It is this app's sentinel for a prayer with no location (see
 *   useCreatePrayer.ts — the `location` column is NOT NULL, so a feed-only
 *   prayer stores POINT(0 0) and relies on show_on_map to stay hidden). It is
 *   also the classic signature of a failed geocode. Drawn, it becomes a point of
 *   light in the Gulf of Guinea claiming to be a person.
 *
 *   Note this rejects ONLY the exact pair. 0°N 30°E is on the equator and
 *   perfectly real, as is 51.5°N 0°E through London — rejecting either component
 *   alone would erase a band of the planet.
 */

/** True when a coordinate can be placed on the globe. */
export function isDrawablePoint(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // The sentinel, not the equator or the prime meridian — see the header.
  if (lat === 0 && lng === 0) return false;
  return true;
}
