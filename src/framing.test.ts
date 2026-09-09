import { describe, expect, it } from 'vitest';
import { MAX_FIT_DIST, REF_ASPECT, fitDistanceForAspect } from './framing';

const BASE = 2.7;

describe('fitDistanceForAspect', () => {
  it('is a fixed point at the reference aspect, so desktop framing is untouched', () => {
    // The gate screenshots were taken at this framing. If this drifts, every
    // wide viewport silently reframes and the gate evidence stops describing
    // what ships.
    expect(fitDistanceForAspect(REF_ASPECT, BASE)).toBeCloseTo(BASE, 12);
  });

  it('never pulls the camera closer than the tuned distance', () => {
    // Only ever pulling back is what makes this safe to apply everywhere: no
    // aspect can crop tighter than the framing that passed the gate.
    for (const aspect of [0.2, 0.462, 0.75, 1, 1.6, 2, 3.5, 21 / 9, 32 / 9]) {
      expect(fitDistanceForAspect(aspect, BASE)).toBeGreaterThanOrEqual(BASE);
    }
  });

  it('leaves wide viewports exactly at the tuned distance', () => {
    for (const aspect of [1.6, 1.78, 2, 2.4, 3.5]) {
      expect(fitDistanceForAspect(aspect, BASE)).toBeCloseTo(BASE, 12);
    }
  });

  it('pulls back enough on a phone portrait viewport to show the whole globe', () => {
    // 390x844 is the iPhone portrait case that was observed overfilling: the
    // globe subtended ~43.5 degrees against a ~14.1 degree horizontal field.
    const d = fitDistanceForAspect(390 / 844, BASE);
    expect(d).toBeGreaterThan(BASE);

    // The globe's angular radius must now fit inside the horizontal half-field.
    const halfFovX = Math.atan(Math.tan((30 * Math.PI) / 180 / 2) * (390 / 844));
    expect(Math.asin(1 / d)).toBeLessThan(halfFovX);
  });

  it('gets monotonically further away as the viewport narrows', () => {
    const aspects = [1.6, 1.2, 1, 0.8, 0.6, 0.462, 0.3];
    const dists = aspects.map((a) => fitDistanceForAspect(a, BASE));
    for (let i = 1; i < dists.length; i++) {
      expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1]);
    }
  });

  it('clamps rather than flying to infinity on a sliver-thin viewport', () => {
    expect(fitDistanceForAspect(0.001, BASE)).toBeLessThanOrEqual(MAX_FIT_DIST);
    expect(Number.isFinite(fitDistanceForAspect(0.001, BASE))).toBe(true);
  });

  it('falls back to the tuned distance on degenerate input instead of NaN', () => {
    // A zero-height container during layout would otherwise produce NaN and put
    // the camera nowhere, which is a blank screen rather than a bad framing.
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(fitDistanceForAspect(bad, BASE)).toBe(BASE);
    }
  });
});

describe('fitDistanceForAspect — near-ground requests are honoured, not reframed', () => {
  // The globe's disc fits the reference field only beyond ~2.54 radii; below that
  // `fill` exceeds 1 and the "preserve the fill fraction" idea has no meaning.
  const NARROW = 1.246; // a real Chrome window aspect that reproduced the bug
  const PORTRAIT = 390 / 844;

  it('returns a low-altitude request UNCHANGED at any aspect', () => {
    // 3 km, 10 km, 30 km above a 6371 km radius.
    for (const d of [1.00047088, 1.00156961, 1.00470884]) {
      for (const a of [REF_ASPECT, NARROW, PORTRAIT, 2.4]) {
        expect(fitDistanceForAspect(a, d)).toBe(d);
      }
    }
  });

  it('is the exact bug that made a 3 km deep link land at 400+ km', () => {
    // Before the guard this returned ~1.063 (about 403 km) for a narrow window
    // while returning baseDist for the harness's 1.6, so the same URL disagreed
    // between two people looking at it.
    const threeKm = 1.00047088;
    expect(fitDistanceForAspect(NARROW, threeKm)).toBe(threeKm);
    expect(fitDistanceForAspect(REF_ASPECT, threeKm)).toBe(threeKm);
  });

  it('STILL pulls back the orbital framing on a narrow viewport', () => {
    // The guard must not undo the phone fix, which was verified on a real iPhone:
    // at the tuned 2.7 radii the fill is 0.937, so the fit still applies.
    const fitted = fitDistanceForAspect(PORTRAIT, 2.7);
    expect(fitted).toBeGreaterThan(2.7);
    expect(fitDistanceForAspect(REF_ASPECT, 2.7)).toBeCloseTo(2.7, 9);
  });

  it('never returns less than the requested distance', () => {
    for (const d of [1.0005, 1.5, 2.7, 4]) {
      for (const a of [0.4, 1.0, 1.6, 3.0]) {
        expect(fitDistanceForAspect(a, d)).toBeGreaterThanOrEqual(d);
      }
    }
  });
});
