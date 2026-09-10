/**
 * navGestures.mutants.test.ts — closing the one open mutant in the wheel-pan maths.
 *
 *   L161 `px * metresPerPixel(...) -> px / metresPerPixel(...)`. Every existing test on
 *   wheelPanMetres compares one call to another (line-vs-pixel equivalence, page > line,
 *   sign), and the `* -> /` swap preserves all of those relationships: both sides divide
 *   instead of multiply, so ratios and signs are unchanged. Only the ABSOLUTE distance
 *   pins it, against the independent perspective formula (metres = pixels * metres-per-
 *   pixel). Under the mutant, 100 px would map to ~150 m instead of ~67 m.
 */
import { describe, expect, it } from 'vitest';
import { metresPerPixel, wheelPanMetres } from './navGestures';

const FOV = (30 * Math.PI) / 180;

describe('wheelPanMetres converts pixels to metres by MULTIPLYING, not dividing', () => {
  it('a pixel-mode delta equals pixels * metres-per-pixel (independent perspective formula)', () => {
    // metres-per-pixel = 2*d*tan(fov/2)/viewport, computed here from first principles.
    const mpp = (2 * 1_000 * Math.tan(FOV / 2)) / 800;
    // deltaMode 0 = pixels, so px = delta = 100.
    expect(wheelPanMetres(100, 0, 1_000, FOV, 800)).toBeCloseTo(100 * mpp, 9);
    // cross-check against the module's own metresPerPixel, so the two stay consistent.
    expect(wheelPanMetres(100, 0, 1_000, FOV, 800)).toBeCloseTo(100 * metresPerPixel(1_000, FOV, 800), 9);
  });

  it('NEGATIVE CONTROL: the divided value is far larger, so the check is not vacuous', () => {
    // Proves the assertion can fail: dividing 100 px by ~0.67 m/px gives ~149 m, which
    // must NOT match 100 * mpp ≈ 67 m.
    const mpp = metresPerPixel(1_000, FOV, 800);
    expect(Math.abs(100 / mpp - 100 * mpp)).toBeGreaterThan(50);
  });
});
