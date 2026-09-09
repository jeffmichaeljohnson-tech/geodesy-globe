import { describe, it, expect } from 'vitest';
import { shortestLonDelta, normaliseLon, flightPointAt, type FlightPoint } from './flightPath';

const DETROIT: FlightPoint = { latDeg: 42.33, lonDeg: -83.05, altitudeM: 10_830_000 };
const TOKYO: FlightPoint = { latDeg: 35.69, lonDeg: 139.69, altitudeM: 74_600 };

describe('shortestLonDelta — the antimeridian fix', () => {
  it('Detroit to Tokyo goes 137 degrees WEST across the Pacific, not 223 east', () => {
    // Worth stating because the naive expectation is the wrong one: Detroit sits at
    // -83 and Tokyo at +139.69, so subtracting gives +222.74 and "east" looks right.
    // The short way is the other direction — 137.26 degrees WEST, over the Pacific,
    // which is also the real great-circle route.
    const d = shortestLonDelta(-83.05, 139.69);
    expect(d).toBeCloseTo(-137.26, 2);
    expect(Math.abs(d)).toBeLessThanOrEqual(180);
  });

  it('crossing +180 to -180 is one degree, not 359', () => {
    expect(shortestLonDelta(179.5, -179.5)).toBeCloseTo(1, 9);
    expect(shortestLonDelta(-179.5, 179.5)).toBeCloseTo(-1, 9);
  });

  it('is zero for a point and itself', () => {
    expect(shortestLonDelta(42, 42)).toBe(0);
  });

  it('never exceeds a half turn, for any pair', () => {
    for (let a = -180; a <= 180; a += 7) {
      for (let b = -180; b <= 180; b += 11) {
        expect(Math.abs(shortestLonDelta(a, b))).toBeLessThanOrEqual(180.0000001);
      }
    }
  });
});

describe('normaliseLon', () => {
  it('leaves an in-range longitude alone', () => {
    expect(normaliseLon(-83.05)).toBeCloseTo(-83.05, 9);
    expect(normaliseLon(139.69)).toBeCloseTo(139.69, 9);
  });
  it('folds values past the antimeridian back into range', () => {
    expect(normaliseLon(190)).toBeCloseTo(-170, 9);
    expect(normaliseLon(-190)).toBeCloseTo(170, 9);
    // 540 is the antimeridian; -180 and +180 name the same meridian, so assert the
    // magnitude rather than picking a sign the caller cannot observe a difference in.
    expect(Math.abs(normaliseLon(540))).toBeCloseTo(180, 9);
  });
  it('never returns negative zero, which would print as "-0"', () => {
    expect(Object.is(normaliseLon(360), -0)).toBe(false);
  });
});

describe('flightPointAt', () => {
  it('is exactly the origin at t=0 and the destination at t=1', () => {
    const a = flightPointAt(DETROIT, TOKYO, 0);
    expect(a.latDeg).toBeCloseTo(DETROIT.latDeg, 9);
    expect(a.lonDeg).toBeCloseTo(DETROIT.lonDeg, 9);
    expect(a.altitudeM).toBeCloseTo(DETROIT.altitudeM, 6);

    const b = flightPointAt(DETROIT, TOKYO, 1);
    expect(b.latDeg).toBeCloseTo(TOKYO.latDeg, 9);
    expect(b.lonDeg).toBeCloseTo(TOKYO.lonDeg, 9);
    expect(b.altitudeM).toBeCloseTo(TOKYO.altitudeM, 6);
  });

  it('clamps outside [0,1] rather than flying past the destination', () => {
    expect(flightPointAt(DETROIT, TOKYO, 3).lonDeg).toBeCloseTo(TOKYO.lonDeg, 9);
    expect(flightPointAt(DETROIT, TOKYO, -3).lonDeg).toBeCloseTo(DETROIT.lonDeg, 9);
  });

  it('TRAVELS ONE WAY the whole flight — never doubles back', () => {
    // The failure this guards is a path that reverses direction partway, which is what
    // an un-unwrapped interpolation does when it crosses the antimeridian.
    let prev = DETROIT.lonDeg;
    let totalTravelled = 0;
    for (let i = 1; i <= 200; i++) {
      const p = flightPointAt(DETROIT, TOKYO, i / 200);
      const step = shortestLonDelta(prev, p.lonDeg);
      expect(step).toBeLessThanOrEqual(1e-9); // westward the whole way, never east
      totalTravelled += step;
      prev = p.lonDeg;
    }
    expect(totalTravelled).toBeCloseTo(-137.26, 1); // the short way, not -223 or +222
  });

  it('descends monotonically on a homecoming', () => {
    let prev = Infinity;
    for (let i = 0; i <= 100; i++) {
      const p = flightPointAt(DETROIT, TOKYO, i / 100);
      expect(p.altitudeM).toBeLessThanOrEqual(prev + 1e-6);
      prev = p.altitudeM;
    }
  });

  it('climbs monotonically on the way back out to the globe', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const p = flightPointAt(TOKYO, DETROIT, i / 100);
      expect(p.altitudeM).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = p.altitudeM;
    }
  });

  it('keeps every intermediate longitude in range', () => {
    for (let i = 0; i <= 100; i++) {
      const p = flightPointAt(DETROIT, TOKYO, i / 100);
      expect(p.lonDeg).toBeGreaterThanOrEqual(-180);
      expect(p.lonDeg).toBeLessThanOrEqual(180);
    }
  });

  it('handles a pole-adjacent journey without producing NaN', () => {
    const near: FlightPoint = { latDeg: 89.9, lonDeg: 0, altitudeM: 100_000 };
    const far: FlightPoint = { latDeg: -89.9, lonDeg: 180, altitudeM: 100_000 };
    for (let i = 0; i <= 20; i++) {
      const p = flightPointAt(near, far, i / 20);
      expect(Number.isFinite(p.latDeg)).toBe(true);
      expect(Number.isFinite(p.lonDeg)).toBe(true);
      expect(Number.isFinite(p.altitudeM)).toBe(true);
    }
  });
});
