import { describe, expect, it } from 'vitest';
import {
  WGS84,
  WGS84_B,
  OriginRebase,
  ecefToGeodetic,
  geodeticToEcef,
  subsolarPoint,
} from './geodesy';

describe('geodeticToEcef basis alignment (ECEF: +X prime meridian, +Y lon 90, +Z north pole)', () => {
  it('places (0,0) on +X at the semi-major axis', () => {
    const [x, y, z] = geodeticToEcef(0, 0, 0);
    expect(x).toBeCloseTo(WGS84.a, 0);
    expect(y).toBeCloseTo(0, 3);
    expect(z).toBeCloseTo(0, 3);
  });

  it('places lon +90 on +Y', () => {
    const [x, y, z] = geodeticToEcef(0, 90, 0);
    expect(x).toBeCloseTo(0, 0);
    expect(y).toBeCloseTo(WGS84.a, 0);
    expect(z).toBeCloseTo(0, 3);
  });

  it('places the north pole on +Z at the semi-minor axis', () => {
    const [x, y, z] = geodeticToEcef(90, 0, 0);
    expect(Math.hypot(x, y)).toBeLessThan(1e-3);
    expect(z).toBeCloseTo(WGS84_B, 0);
  });
});

describe('geodetic <-> ECEF round-trips (Bowring) recover the input', () => {
  const cases: Array<[number, number, number]> = [
    [0, 0, 0],
    [40.7128, -74.006, 30], // New York
    [-33.8688, 151.2093, 58], // Sydney
    [51.5074, -0.1278, 11], // London
    [-89.9, 179.9, 5000], // pole-adjacent, near the antimeridian
  ];
  for (const [lat, lon, alt] of cases) {
    it(`(${lat}, ${lon}, ${alt})`, () => {
      const e = geodeticToEcef(lat, lon, alt);
      const g = ecefToGeodetic(e[0], e[1], e[2]);
      expect(g.latDeg).toBeCloseTo(lat, 6);
      expect(((g.lonDeg - lon + 540) % 360) - 180).toBeCloseTo(0, 6);
      expect(g.altM).toBeCloseTo(alt, 2);
    });
  }
});

describe('subsolarPoint stays within the tropics', () => {
  it('declination never exceeds the obliquity of the ecliptic', () => {
    for (let m = 0; m < 12; m++) {
      const { latDeg, lonDeg } = subsolarPoint(new Date(Date.UTC(2026, m, 15, 12, 0, 0)));
      expect(Math.abs(latDeg)).toBeLessThanOrEqual(23.5);
      expect(lonDeg).toBeGreaterThanOrEqual(-180);
      expect(lonDeg).toBeLessThanOrEqual(180);
    }
  });
});

describe('OriginRebase does the float64 subtraction', () => {
  it('toRender subtracts the origin', () => {
    const rb = new OriginRebase([10, 20, 30]);
    const v = rb.toRender([110, 220, 330]);
    expect([v.x, v.y, v.z]).toEqual([100, 200, 300]);
  });

  it('geodeticToRender against the surface point beneath it yields a near-zero vector', () => {
    const surface = geodeticToEcef(35, -120, 0);
    const rb = new OriginRebase(surface);
    const v = rb.geodeticToRender(35, -120, 0);
    expect(v.length()).toBeLessThan(1e-3);
  });
});
