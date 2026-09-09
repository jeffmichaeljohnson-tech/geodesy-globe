import { describe, it, expect } from 'vitest';
import { navActionFor, wheelActionFor, metresPerPixel, wheelPanMetres } from './navGestures';

describe('navActionFor — one drag, two meanings, decided by altitude', () => {
  it('spins the globe when there is no ground anchor', () => {
    // Up in orbit the target is Earth's centre, so a drag swings the camera around
    // the planet. That already felt right and must not change.
    expect(navActionFor({ groundAnchored: false })).toBe('spin');
  });

  it('pans the map once a ground anchor is latched', () => {
    // This is the fix. The same drag used to orbit the anchor, which reads as tilt.
    expect(navActionFor({ groundAnchored: true })).toBe('pan');
  });

  it('an explicit tilt request beats the altitude rule, at either altitude', () => {
    // Someone holding shift has said what they want; do not out-clever them.
    expect(navActionFor({ groundAnchored: true, tiltModifier: true })).toBe('tilt');
    expect(navActionFor({ groundAnchored: false, tiltModifier: true })).toBe('tilt');
  });

  it('a pinch is a zoom everywhere, because pinch means zoom everywhere', () => {
    expect(navActionFor({ groundAnchored: true, pinch: true })).toBe('zoom');
    expect(navActionFor({ groundAnchored: false, pinch: true })).toBe('zoom');
  });

  it('tilt outranks pinch when both are somehow present', () => {
    // Order is deliberate, so pin it: the explicit modifier wins.
    expect(navActionFor({ groundAnchored: true, pinch: true, tiltModifier: true })).toBe('tilt');
  });

  it('never returns tilt by accident — the whole complaint in one assertion', () => {
    // Every combination WITHOUT the modifier must navigate or zoom. If this goes
    // red, tilt has crept back into a plain drag.
    for (const groundAnchored of [true, false]) {
      for (const pinch of [true, false]) {
        expect(navActionFor({ groundAnchored, pinch })).not.toBe('tilt');
      }
    }
  });
});

describe('wheelActionFor — a scroll is not a drag', () => {
  it('pans near the ground, which is the whole complaint', () => {
    expect(wheelActionFor({ groundAnchored: true })).toBe('pan');
  });

  it('zooms in orbit, matching every map application at planet scale', () => {
    expect(wheelActionFor({ groundAnchored: false })).toBe('zoom');
  });

  it('a pinch zooms at BOTH altitudes', () => {
    // ctrlKey is how a browser encodes a trackpad pinch, not a held key.
    expect(wheelActionFor({ groundAnchored: true, pinch: true })).toBe('zoom');
    expect(wheelActionFor({ groundAnchored: false, pinch: true })).toBe('zoom');
  });

  it('a scroll NEVER tilts, at any altitude', () => {
    for (const groundAnchored of [true, false]) {
      for (const pinch of [true, false]) {
        expect(wheelActionFor({ groundAnchored, pinch })).not.toBe('tilt');
      }
    }
  });
});

describe('metresPerPixel — the number that makes the ground track the pointer', () => {
  const FOV = (30 * Math.PI) / 180;

  it('scales linearly with distance', () => {
    const near = metresPerPixel(1_000, FOV, 800);
    const far = metresPerPixel(2_000, FOV, 800);
    expect(far / near).toBeCloseTo(2, 6);
  });

  it('halves when the viewport doubles', () => {
    expect(metresPerPixel(1_000, FOV, 1600)).toBeCloseTo(metresPerPixel(1_000, FOV, 800) / 2, 9);
  });

  it('is zero rather than Infinity for a zero-height viewport', () => {
    // A layout can report 0 for a frame; dividing by it would fling the camera.
    expect(metresPerPixel(1_000, FOV, 0)).toBe(0);
  });

  it('matches the perspective formula at a known point', () => {
    // 2 * d * tan(fov/2) / h, computed independently.
    const expected = (2 * 1_000 * Math.tan(FOV / 2)) / 800;
    expect(metresPerPixel(1_000, FOV, 800)).toBeCloseTo(expected, 9);
  });
});

describe('wheel deltas are normalised, because deltaMode is not always pixels', () => {
  const FOV = (30 * Math.PI) / 180;

  it('treats one LINE as roughly sixteen pixels', () => {
    const asLines = wheelPanMetres(1, 1, 1_000, FOV, 800);
    const asPixels = wheelPanMetres(16, 0, 1_000, FOV, 800);
    expect(asLines).toBeCloseTo(asPixels, 9);
  });

  it('treats one PAGE as much more than one line', () => {
    expect(Math.abs(wheelPanMetres(1, 2, 1_000, FOV, 800)))
      .toBeGreaterThan(Math.abs(wheelPanMetres(1, 1, 1_000, FOV, 800)));
  });

  it('keeps the sign, so the map follows the fingers rather than fighting them', () => {
    expect(wheelPanMetres(-10, 0, 1_000, FOV, 800)).toBeLessThan(0);
    expect(wheelPanMetres(10, 0, 1_000, FOV, 800)).toBeGreaterThan(0);
  });
});
