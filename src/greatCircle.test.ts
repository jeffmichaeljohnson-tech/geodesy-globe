import { describe, expect, it } from 'vitest';
import { centralAngle, polylineAngularLength, sampleGreatCircle } from './greatCircle';

const RAD2DEG = 180 / Math.PI;

// The three named fixtures. Each pair spans the antimeridian (or the pole) so a
// naive longitude interpolation would draw the long way round — the exact defect
// the plan flags as the single most likely one in this wave.
const TOKYO = { name: 'Tokyo', lat: 35.6762, lon: 139.6503 };
const LA = { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 };
const AUCKLAND = { name: 'Auckland', lat: -36.8485, lon: 174.7633 };
const SANTIAGO = { name: 'Santiago', lat: -33.4489, lon: -70.6693 };
// Pole-adjacent: two points near the North Pole straddling the antimeridian. The
// minor arc goes OVER the pole (~4° of arc), not the long way round at ~88°N.
const NEAR_POLE_A = { name: 'near-pole A', lat: 88, lon: -150 };
const NEAR_POLE_B = { name: 'near-pole B', lat: 88, lon: 150 };

/** Largest jump in the WRAPPED longitude between consecutive samples, degrees. */
function maxWrappedLonStep(samples: { lonDeg: number }[]): number {
  let m = 0;
  for (let i = 1; i < samples.length; i++) m = Math.max(m, Math.abs(samples[i].lonDeg - samples[i - 1].lonDeg));
  return m;
}

/** Largest jump in the UNWRAPPED longitude between consecutive samples, degrees. */
function maxUnwrappedLonStep(samples: { lonUnwrappedDeg: number }[]): number {
  let m = 0;
  for (let i = 1; i < samples.length; i++)
    m = Math.max(m, Math.abs(samples[i].lonUnwrappedDeg - samples[i - 1].lonUnwrappedDeg));
  return m;
}

describe('sampleGreatCircle takes the MINOR arc (no long-way streak)', () => {
  for (const [A, B] of [
    [TOKYO, LA],
    [AUCKLAND, SANTIAGO],
    [NEAR_POLE_A, NEAR_POLE_B],
  ] as const) {
    it(`${A.name} ↔ ${B.name}: polyline length equals the minor central angle`, () => {
      const samples = sampleGreatCircle(A.lat, A.lon, B.lat, B.lon, { segments: 128 });
      const minor = centralAngle(A.lat, A.lon, B.lat, B.lon); // < π by construction
      const drawn = polylineAngularLength(samples);
      // The short way: the drawn arc matches the minor central angle to within a
      // fraction of a degree. The long way (2π − minor) would be off by >100°.
      expect(drawn * RAD2DEG).toBeCloseTo(minor * RAD2DEG, 1);
      // And it is genuinely the short one, nowhere near half the globe.
      expect(drawn).toBeLessThan(Math.PI);
    });
  }
});

describe('Tokyo ↔ Los Angeles crosses the Pacific eastward, not through longitude 0', () => {
  const s = sampleGreatCircle(TOKYO.lat, TOKYO.lon, LA.lat, LA.lon, { segments: 128 });

  it('unwrapped longitude ends past +180 (crossed the antimeridian going east)', () => {
    // East across the Pacific: 139.65 → ~241.76 (= −118.24 + 360). The long way
    // west would land near −118.24 with no antimeridian crossing.
    expect(s[0].lonUnwrappedDeg).toBeCloseTo(TOKYO.lon, 3);
    expect(s[s.length - 1].lonUnwrappedDeg).toBeGreaterThan(235);
    expect(s[s.length - 1].lonUnwrappedDeg).toBeLessThan(248);
  });

  it('never passes through the Atlantic (no mid-arc sample near longitude 0)', () => {
    // The whole minor arc stays in the Pacific: no sample sits in |lon| < 90.
    for (const p of s) expect(Math.abs(p.lonDeg)).toBeGreaterThan(90);
  });

  it('bows poleward — the midpoint is well north of both endpoints', () => {
    const mid = s[Math.floor(s.length / 2)];
    expect(mid.latDeg).toBeGreaterThan(45);
  });

  it('unwrapping removes the +179 → −179 discontinuity', () => {
    // In wrapped space one sample-to-sample step leaps ~360° at the antimeridian.
    expect(maxWrappedLonStep(s)).toBeGreaterThan(180);
    // In unwrapped space every step is tiny — one continuous line.
    expect(maxUnwrappedLonStep(s)).toBeLessThan(5);
  });
});

describe('Auckland ↔ Santiago crosses the South Pacific eastward over the antimeridian', () => {
  const s = sampleGreatCircle(AUCKLAND.lat, AUCKLAND.lon, SANTIAGO.lat, SANTIAGO.lon, { segments: 128 });

  it('unwrapped longitude ends past +180 (east over the antimeridian)', () => {
    // East: 174.76 → ~289.33 (= −70.67 + 360).
    expect(s[0].lonUnwrappedDeg).toBeCloseTo(AUCKLAND.lon, 3);
    expect(s[s.length - 1].lonUnwrappedDeg).toBeGreaterThan(283);
    expect(s[s.length - 1].lonUnwrappedDeg).toBeLessThan(296);
  });

  it('unwrapping removes the antimeridian discontinuity', () => {
    expect(maxWrappedLonStep(s)).toBeGreaterThan(180);
    expect(maxUnwrappedLonStep(s)).toBeLessThan(5);
  });
});

describe('pole-adjacent pair takes the short antimeridian hop, not the long way round', () => {
  // 88°N, 60° of longitude apart the short way (−150 → +150 over ±180). The minor
  // great circle bows a little poleward — peaking near 88.3°N — and stays high; the
  // long way would sweep 300° of longitude and dip far south. This exercises the
  // high-latitude regime (where naive planar math misbehaves) plus antimeridian
  // unwrapping, without the exactly-over-the-pole longitude singularity.
  const s = sampleGreatCircle(NEAR_POLE_A.lat, NEAR_POLE_A.lon, NEAR_POLE_B.lat, NEAR_POLE_B.lon, { segments: 128 });

  it('bows slightly poleward at the midpoint, staying near 88°N', () => {
    const mid = s[Math.floor(s.length / 2)];
    expect(mid.latDeg).toBeGreaterThan(88);
    expect(mid.latDeg).toBeLessThan(89);
  });

  it('no sample dips toward the equator (the long-way failure)', () => {
    for (const p of s) expect(p.latDeg).toBeGreaterThan(87.9);
  });

  it('crosses the antimeridian with clean unwrapping', () => {
    expect(maxWrappedLonStep(s)).toBeGreaterThan(180);
    expect(maxUnwrappedLonStep(s)).toBeLessThan(5);
  });
});

describe('the bow height — proportion, not a floor that swallows it', () => {
  /** Peak bow of the arc between two points, in metres. */
  const bowM = (fromLat: number, fromLon: number, toLat: number, toLon: number): number => {
    const s = sampleGreatCircle(fromLat, fromLon, toLat, toLon, { segments: 64 });
    // The RISE above the endpoints, not the absolute altitude — the endpoints carry their
    // own small base lift, and it is the rise that decides whether a line reads as a bow
    // or as a spike.
    return Math.max(...s.map((p) => p.altM)) - s[0].altM;
  };
  /** Great-circle length in metres, for comparing the bow against the span. */
  const lengthM = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
    const D = Math.PI / 180;
    const c = Math.sin(aLat * D) * Math.sin(bLat * D) +
      Math.cos(aLat * D) * Math.cos(bLat * D) * Math.cos((bLon - aLon) * D);
    return Math.acos(Math.min(1, Math.max(-1, c))) * 6_371_000;
  };

  it('never bows taller than a local arc is long — THE DEFECT THIS PINS', () => {
    // 103 of the 141 real connections are under 50 km. The old 120 km floor made a 30 km
    // line bow FOUR TIMES its own length: a vertical spike whose bulk sat 120 km up,
    // parallaxing against the ground as the camera orbited and reading as detached.
    // Detroit to Ann Arbor, about 55 km.
    const len = lengthM(42.331, -83.045, 42.28, -83.74);
    const bow = bowM(42.331, -83.045, 42.28, -83.74);
    expect(bow).toBeLessThan(len);
    expect(bow / len).toBeLessThan(0.2);
  });

  it('holds the same proportion at the MEDIAN real connection length, 30 km', () => {
    const len = lengthM(42.331, -83.045, 42.331, -82.68);
    const bow = bowM(42.331, -83.045, 42.331, -82.68);
    expect(len).toBeGreaterThan(25_000);
    expect(len).toBeLessThan(35_000);
    expect(bow / len).toBeLessThan(0.2);
    expect(bow).toBeLessThan(6_000); // a few km over a few tens of km — a gentle curve
  });

  it('still lifts a long arc enough to read AS an arc', () => {
    // The proportion was never the problem, and this makes sure fixing the floor did not
    // flatten the intercontinental case. Detroit to Los Angeles, ~3,200 km.
    const len = lengthM(42.331, -83.045, 34.05, -118.24);
    const bow = bowM(42.331, -83.045, 34.05, -118.24);
    expect(bow).toBeGreaterThan(150_000);
    expect(bow / len).toBeGreaterThan(0.05);
    expect(bow / len).toBeLessThan(0.15);
  });

  it('degrades sanely when both endpoints are the same place', () => {
    // The real data's minimum length is 0 km — somebody praying for a prayer at their own
    // spot. That must not become a vertical line standing 120 km out of the ground.
    const bow = bowM(42.331, -83.045, 42.331, -83.045);
    expect(bow).toBeLessThan(1_000);
    expect(Number.isFinite(bow)).toBe(true);
  });

  it('keeps a ceiling, so an antipodal arc cannot leave the planet', () => {
    expect(bowM(0, 0, 0, 180)).toBeLessThanOrEqual(1_500_000);
    // and the endpoints themselves stay on the ground rather than starting in the sky
    const ends = sampleGreatCircle(0, 0, 0, 180, { segments: 8 });
    expect(ends[0].altM).toBeLessThanOrEqual(1_000);
  });
});
