import { describe, expect, it } from 'vitest';
import { subsolarPoint } from './geodesyMath';

/**
 * Conformance vectors for the subsolar point, against PUBLISHED astronomy — not
 * against the code's own constants.
 *
 * WHY THIS FILE EXISTS. The only existing check on `subsolarPoint`
 * (geodesy.test.ts) asserts |latitude| ≤ 23.5° across a year. That is a one-sided
 * bound: it proves the declination never runs too hot, but it would stay green if
 * the sun sat frozen on the equator all year, or if the obliquity constant were
 * halved, or if the hemispheres were swapped. These anchor the declination to
 * facts an almanac states independently of this code.
 *
 * THE PUBLISHED ANCHORS.
 *  - The obliquity of the ecliptic in 2026 is ε ≈ 23.436° (23°26′), and the
 *    solar declination reaches exactly ±ε at the solstices. That figure comes
 *    from the IAU value, not from the 23.439 sat inside geodesyMath.
 *  - Solar declination is 0° at the equinox instants.
 *  - At 12:00 UTC the sun stands near the prime meridian; it is displaced only by
 *    the equation of time, whose annual range is about ±16 min ≈ ±4° of longitude.
 *
 * Instants below are the 2026 equinoxes and solstices to the published minute (UTC).
 */

const JUNE_SOLSTICE = new Date(Date.UTC(2026, 5, 21, 8, 25));
const DEC_SOLSTICE = new Date(Date.UTC(2026, 11, 21, 20, 50));
const MAR_EQUINOX = new Date(Date.UTC(2026, 2, 20, 14, 46));
const SEP_EQUINOX = new Date(Date.UTC(2026, 8, 23, 0, 5));

describe('subsolar declination matches the published solar year', () => {
  it('reaches the obliquity of the ecliptic (~+23.44°) at the June solstice', () => {
    // Northern-summer solstice: the sun is overhead the Tropic of Cancer.
    const { latDeg } = subsolarPoint(JUNE_SOLSTICE);
    expect(latDeg).toBeGreaterThan(23.4);
    expect(latDeg).toBeLessThan(23.5);
  });

  it('reaches minus the obliquity (~-23.44°) at the December solstice', () => {
    // Southern-summer solstice: overhead the Tropic of Capricorn. Also pins the
    // hemisphere — a sign error would put December in the north.
    const { latDeg } = subsolarPoint(DEC_SOLSTICE);
    expect(latDeg).toBeLessThan(-23.4);
    expect(latDeg).toBeGreaterThan(-23.5);
  });

  it('crosses the equator (declination ≈ 0) at both equinoxes', () => {
    expect(Math.abs(subsolarPoint(MAR_EQUINOX).latDeg)).toBeLessThan(0.1);
    expect(Math.abs(subsolarPoint(SEP_EQUINOX).latDeg)).toBeLessThan(0.1);
  });
});

describe('subsolar longitude tracks solar time', () => {
  it('sits near the prime meridian at 12:00 UTC, within the equation of time', () => {
    // The equation of time never exceeds ~16 min ≈ 4° of longitude, so at solar
    // noon UTC the subsolar meridian is always within a few degrees of 0.
    for (const day of ['2026-01-15', '2026-03-20', '2026-06-21', '2026-09-23', '2026-11-03', '2026-12-21']) {
      const { lonDeg } = subsolarPoint(new Date(`${day}T12:00:00Z`));
      expect(Math.abs(lonDeg), `${day} subsolar lon was ${lonDeg}`).toBeLessThan(5);
    }
  });

  it('advances westward ~15° per hour as the Earth turns under the sun', () => {
    // One hour later the subsolar point should move ~15° west (the Earth rotates
    // 360°/24h eastward). Independent of declination; pins the sidereal-time term.
    const noon = subsolarPoint(new Date('2026-06-21T12:00:00Z')).lonDeg;
    const oneHourLater = subsolarPoint(new Date('2026-06-21T13:00:00Z')).lonDeg;
    // Westward means the longitude decreases by ~15° over the hour.
    expect(noon - oneHourLater).toBeGreaterThan(14.5);
    expect(noon - oneHourLater).toBeLessThan(15.5);
  });
});
