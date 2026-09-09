import { describe, expect, it } from 'vitest';
import { geodeticToEcef, ecefToGeodetic, haversineKm, sampleGreatCircle } from './index';

/**
 * The README's "Use it" block prints specific numbers. A number in prose cannot
 * fail, so it rots the moment a constant moves. These pin exactly what the README
 * shows, against literals — so the example and the code cannot silently disagree.
 * If you change the example, change these, visibly, in the same commit.
 */
describe('the README "Use it" example produces exactly the numbers it prints', () => {
  it('geodeticToEcef of the Royal Observatory, Greenwich', () => {
    const ecef = geodeticToEcef(51.4779, -0.0015, 46);
    expect(ecef[0]).toBeCloseTo(3980601.155, 3);
    expect(ecef[1]).toBeCloseTo(-104.212, 3);
    expect(ecef[2]).toBeCloseTo(4966867.44, 2);
  });

  it('ecefToGeodetic recovers the input', () => {
    const ecef = geodeticToEcef(51.4779, -0.0015, 46);
    const g = ecefToGeodetic(ecef[0], ecef[1], ecef[2]);
    expect(g.latDeg).toBeCloseTo(51.4779, 6);
    expect(g.lonDeg).toBeCloseTo(-0.0015, 6);
    expect(g.altM).toBeCloseTo(46, 3);
  });

  it('haversineKm London → New York is 5570.2 km', () => {
    expect(haversineKm([-0.1278, 51.5074], [-74.006, 40.7128])).toBeCloseTo(5570.2, 1);
  });

  it('sampleGreatCircle London → New York: 65 samples bowing north over the Atlantic', () => {
    const arc = sampleGreatCircle(51.5074, -0.1278, 40.7128, -74.006, { segments: 64 });
    expect(arc).toHaveLength(65);
    expect(arc[32].latDeg).toBeCloseTo(52.3684, 4);
    expect(arc[32].lonDeg).toBeCloseTo(-41.2903, 4);
  });
});
