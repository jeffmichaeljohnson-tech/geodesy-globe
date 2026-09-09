import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as api from './index';
import * as math from './geodesyMath';

const HERE = new URL('.', import.meta.url).pathname;

describe('the package entry points are real', () => {
  it('the barrel exports the surface the README names', () => {
    for (const name of [
      'WGS84', 'geodeticToEcef', 'ecefToGeodetic', 'subsolarPoint',
      'EARTH_MEAN_RADIUS', 'OriginRebase', 'sphereToEcefMatrix',
    ]) {
      expect(api, `missing export: ${name}`).toHaveProperty(name);
    }
  });

  it('the maths entry point has no dependencies at all', () => {
    // The README claims code needing only the maths can import `geodesy-globe/math`
    // and never pull `three` into its bundle. That claim is only true while this
    // file has zero imports, so the claim is asserted here rather than trusted.
    const src = readFileSync(join(HERE, 'geodesyMath.ts'), 'utf8');
    const imports = src.split('\n').filter((l: string) => /^\s*import\s/.test(l));
    expect(imports, `geodesyMath.ts grew imports: ${imports.join(' | ')}`).toHaveLength(0);
    expect(math.geodeticToEcef(0, 0, 0)[0]).toBeCloseTo(6378137, 0);
  });
});
