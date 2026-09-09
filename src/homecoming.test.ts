import { describe, it, expect } from 'vitest';
import {
  haversineKm, flyTierFor, FLY_DURATIONS, FLY_TIER_NEAR_KM, FLY_TIER_MED_KM,
  altitudeForGroundExtentKm, ARRIVAL_GROUND_EXTENT_KM, easeFly, shouldFlyHome,
  photorealAvailableFrom, arrivalAltitudeM, LEGIBLE_FALLBACK_ALT_KM,
  shouldFetchOnPermission,
} from './homecoming';
import { FOV_Y_RAD } from './framing';
// Inlined from the globe module this package does not depend on: the altitude
// at or below which photoreal tiles engage.
const PHOTOREAL_ENGAGE_KM = 2000;

// These four values are COPIED from the iOS app so the two products feel the same.
// If someone edits them here without editing the app, this is where it shows up.
describe('parity with the app’s flight constants', () => {
  it('keeps the durations the app uses', () => {
    expect(FLY_DURATIONS).toEqual({ near: 1300, med: 2000, far: 2800 });
  });
  it('keeps the tier boundaries the app uses', () => {
    expect(FLY_TIER_NEAR_KM).toBe(150);
    expect(FLY_TIER_MED_KM).toBe(1200);
  });
});

describe('haversineKm axis order', () => {
  // haversineKm is the only [lng, lat] signature in this package; everything
  // else is latitude-first. A swapped pair type-checks and returns a plausible
  // number, so the order is pinned here rather than left to the label.
  it('reads element 0 as longitude and element 1 as latitude', () => {
    // Two points differing ONLY in longitude, at the equator where a degree of
    // longitude is a full degree of arc.
    const oneDegOfLon = haversineKm([0, 0], [1, 0]);
    // The same two numbers read the other way round differ only in LATITUDE.
    const oneDegOfLat = haversineKm([0, 0], [0, 1]);
    // Both are one degree of arc at the equator, so a swap is invisible there --
    // which is exactly why the discriminating case has to be off the equator.
    expect(oneDegOfLon).toBeCloseTo(oneDegOfLat, 6);

    // At 60N a degree of longitude is half a degree of arc; a degree of latitude
    // is unchanged. Swapping the pair therefore doubles or halves the answer.
    const lonAt60 = haversineKm([0, 60], [1, 60]);
    const latFrom60 = haversineKm([0, 60], [0, 61]);
    expect(lonAt60).toBeLessThan(latFrom60 * 0.55);
    expect(lonAt60).toBeGreaterThan(latFrom60 * 0.45);
  });

  it('a swapped pair gives a DIFFERENT distance, away from the symmetric cases', () => {
    // Two symmetries make a careless swap test pass against a swapped
    // implementation, and both were hit while writing this:
    //   - at the equator a degree of longitude IS a degree of latitude;
    //   - from the origin, cos(sigma) = cos(lat)cos(lon), which is symmetric in
    //     the two, so ANY pair with an endpoint at [0, 0] is swap-invariant.
    // So the discriminating case has neither endpoint at the origin nor on the
    // equator. 1278.73 km as written; 1544.76 km read latitude-first.
    const asWritten = haversineKm([10, 50], [20, 60]);
    const swapped = haversineKm([50, 10], [60, 20]);
    expect(asWritten).toBeCloseTo(1278.73, 1);
    expect(swapped).toBeCloseTo(1544.76, 1);
  });
});

describe('haversineKm', () => {
  it('is zero for a point and itself', () => {
    expect(haversineKm([-83.05, 42.33], [-83.05, 42.33])).toBe(0);
  });
  it('matches a known long-haul distance (Tokyo→LA ≈ 8,800 km)', () => {
    const km = haversineKm([139.69, 35.69], [-118.24, 34.05]);
    expect(km).toBeGreaterThan(8600);
    expect(km).toBeLessThan(9000);
  });
  it('crosses the antimeridian without taking the long way round', () => {
    // 1° apart in longitude, straddling ±180 — a naive lng subtraction gives 359°.
    const km = haversineKm([179.5, 0], [-179.5, 0]);
    expect(km).toBeLessThan(120); // ~111 km, not ~40,000
  });
});

describe('flyTierFor', () => {
  it('a short hop is near', () => {
    const r = flyTierFor([-83.05, 42.33], [-83.1, 42.4]); // a few km
    expect(r.tier).toBe('near');
    expect(r.durationMs).toBe(1300);
  });
  it('another continent is far', () => {
    const r = flyTierFor([-83.05, 42.33], [139.69, 35.69]);
    expect(r.tier).toBe('far');
    expect(r.durationMs).toBe(2800);
  });
  it('pairs every tier with its OWN duration', () => {
    for (const to of [[-83.1, 42.4], [-95, 45], [139.69, 35.69]] as [number, number][]) {
      const r = flyTierFor([-83.05, 42.33], to);
      expect(r.durationMs).toBe(FLY_DURATIONS[r.tier]);
    }
  });
});

describe('altitudeForGroundExtentKm', () => {
  it('a wider view needs a higher camera', () => {
    const near = altitudeForGroundExtentKm(40, FOV_Y_RAD);
    const wide = altitudeForGroundExtentKm(400, FOV_Y_RAD);
    expect(wide).toBeGreaterThan(near);
  });
  it('inverts consistently: the extent at altitude A frames back to A', () => {
    const alt = altitudeForGroundExtentKm(250, FOV_Y_RAD);
    const extentKm = (2 * alt * Math.tan(FOV_Y_RAD / 2)) / 1000;
    expect(extentKm).toBeCloseTo(250, 6);
  });
});

// The cost note in homecoming.ts claims the app-matching arrival sits BELOW the
// photoreal line, and that a ~1070 km extent is where that line falls. Prose can't
// fail, so both halves are asserted here.
describe('the arrival altitude vs Google’s billable photoreal threshold', () => {
  const arrivalAltKm = altitudeForGroundExtentKm(ARRIVAL_GROUND_EXTENT_KM, FOV_Y_RAD) / 1000;

  it('the app-matching arrival DOES engage photoreal (this is the billable case)', () => {
    expect(arrivalAltKm).toBeLessThan(PHOTOREAL_ENGAGE_KM);
  });

  it('the free alternative is an extent above ~1070 km, as the comment states', () => {
    const breakEvenExtentKm = (2 * PHOTOREAL_ENGAGE_KM * 1000 * Math.tan(FOV_Y_RAD / 2)) / 1000;
    expect(breakEvenExtentKm).toBeGreaterThan(1000);
    expect(breakEvenExtentKm).toBeLessThan(1150);
    // and an arrival at that extent would sit at/above the threshold
    expect(altitudeForGroundExtentKm(breakEvenExtentKm, FOV_Y_RAD) / 1000)
      .toBeGreaterThanOrEqual(PHOTOREAL_ENGAGE_KM - 1);
  });
});

describe('easeFly', () => {
  it('starts at 0, ends at 1, and passes through the midpoint', () => {
    expect(easeFly(0)).toBe(0);
    expect(easeFly(1)).toBe(1);
    expect(easeFly(0.5)).toBeCloseTo(0.5, 6);
  });
  it('clamps outside [0,1] rather than overshooting', () => {
    expect(easeFly(-3)).toBe(0);
    expect(easeFly(9)).toBe(1);
  });
  it('is monotonic', () => {
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const v = easeFly(i / 40);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('shouldFlyHome — the app’s four gates, plus the web’s two', () => {
  const open = {
    hasPosition: true, mapReady: true, alreadyFlew: false,
    focusActive: false, disabled: false,
  };

  it('flies when everything is ready', () => {
    expect(shouldFlyHome(open)).toBe(true);
  });

  it('waits for a position', () => {
    expect(shouldFlyHome({ ...open, hasPosition: false })).toBe(false);
  });

  it('waits for the globe to paint', () => {
    expect(shouldFlyHome({ ...open, mapReady: false })).toBe(false);
  });

  it('fires ONCE per mount, as the app does', () => {
    expect(shouldFlyHome({ ...open, alreadyFlew: true })).toBe(false);
  });

  it('YIELDS to a permalink or a search — the camera is already showing what was asked for', () => {
    expect(shouldFlyHome({ ...open, focusActive: true })).toBe(false);
  });

  it('respects ?nofly=1, so a capture cannot trigger a billable descent', () => {
    expect(shouldFlyHome({ ...open, disabled: true })).toBe(false);
  });

  it('needs EVERY gate — no single one is sufficient', () => {
    const keys = ['hasPosition', 'mapReady', 'alreadyFlew', 'focusActive', 'disabled'] as const;
    for (const k of keys) {
      const closed = { ...open, [k]: k === 'hasPosition' || k === 'mapReady' ? false : true };
      expect(shouldFlyHome(closed)).toBe(false);
    }
  });
});

// The late-grant hole: a position may never ARRIVE. shouldFlyHome is already correct
// for a late grant (give it a position and it flies), but a visitor who allows location
// from the browser's own chrome AFTER the one prompt was dismissed fetches nothing
// unless this predicate says to ask again. Each case here fails if the guard is removed:
// return a constant true and the "already have a fix" and non-granted cases break;
// return false and the whole late-grant refetch dies.
describe('shouldFetchOnPermission — the late chrome-grant refetch', () => {
  it('refetches when a grant lands and no fix is in hand yet', () => {
    expect(shouldFetchOnPermission('granted', false)).toBe(true);
  });
  it('does NOT refetch when a position is already held — no battery cost for nothing', () => {
    expect(shouldFetchOnPermission('granted', true)).toBe(false);
  });
  it('does NOT refetch on a still-undetermined prompt — the fix is already pending', () => {
    expect(shouldFetchOnPermission('prompt', false)).toBe(false);
  });
  it('does NOT refetch on a denial — asking a person who said no earns a permanent block', () => {
    expect(shouldFetchOnPermission('denied', false)).toBe(false);
  });
});

describe('the arrival when there are no photoreal tiles to arrive on', () => {
  // Measured by blocking tile.googleapis.com and flying to Detroit: at 74.6 km the
  // fallback basemap is an unrecognisable smear, at 1600 km the Great Lakes read.
  const FOV = FOV_Y_RAD;

  it('treats an empty or unknown status as available, not as failure', () => {
    // Tiles report failure only after trying. Assuming the worst from silence would
    // strand every visitor at the fallback height on a perfectly healthy day.
    expect(photorealAvailableFrom(undefined)).toBe(true);
    expect(photorealAvailableFrom(null)).toBe(true);
    expect(photorealAvailableFrom('')).toBe(true);
  });

  it('recognises every failure string Tiles3D actually publishes', () => {
    expect(photorealAvailableFrom('no key — buildings off')).toBe(false);
    expect(photorealAvailableFrom('google unreachable — buildings off (fetch failed)')).toBe(false);
    expect(photorealAvailableFrom('NO KEY — BUILDINGS OFF')).toBe(false);
  });

  it('keeps the app-matching arrival when photoreal is there', () => {
    const m = arrivalAltitudeM(FOV, true);
    expect(m).toBeCloseTo(altitudeForGroundExtentKm(ARRIVAL_GROUND_EXTENT_KM, FOV), 6);
    // ~74.6 km — low enough that a ground anchor latches and the tilt works.
    expect(m / 1000).toBeGreaterThan(70);
    expect(m / 1000).toBeLessThan(80);
  });

  it('stops at a legible height when photoreal is gone', () => {
    expect(arrivalAltitudeM(FOV, false)).toBe(LEGIBLE_FALLBACK_ALT_KM * 1000);
  });

  it('the fallback is far higher than the arrival it replaces', () => {
    // The whole point. If these two ever converge, the fallback has stopped doing
    // anything and the visitor is back to landing on a smear.
    expect(arrivalAltitudeM(FOV, false)).toBeGreaterThan(arrivalAltitudeM(FOV, true) * 10);
  });

  it('the fallback is above the 400 km anchor line, so it is knowingly untilted', () => {
    // Recorded as an assertion rather than a comment: an anchor latches only below
    // 400 km, so this arrival cannot tilt. That is the accepted trade — an untilted
    // legible continent beats a tilted smear — and this pins it as deliberate.
    expect(LEGIBLE_FALLBACK_ALT_KM).toBeGreaterThan(400);
  });
});
