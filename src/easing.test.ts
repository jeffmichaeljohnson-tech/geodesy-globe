import { describe, it, expect } from 'vitest';
import { easeControl } from './easing';
import { easeFly } from './homecoming';

describe('easeControl — the curve that answers a button press', () => {
  it('is a well-formed ease: 0 at the start, 1 at the end', () => {
    expect(easeControl(0)).toBe(0);
    expect(easeControl(1)).toBe(1);
  });

  it('clamps, so an overrun cannot fly past the destination and back', () => {
    expect(easeControl(-1)).toBe(0);
    expect(easeControl(5)).toBe(1);
  });

  it('never goes backwards', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeControl(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  // ── THE ACTUAL BUG, PINNED ────────────────────────────────────────────────
  // JJ reported "a slight delay before the camera starts moving". There was no
  // delay in the code — easeInOutCubic simply draws one, because its velocity at
  // t=0 is zero. These two tests are the difference he felt.
  it('moves visibly in the first 100ms of a 1300ms zoom, where easeFly does not', () => {
    const t = 100 / 1300; // the 'near' tier a zoom uses
    const control = easeControl(t);
    const journey = easeFly(t);

    // easeFly covers less than half a percent — imperceptible, and read as lag.
    expect(journey).toBeLessThan(0.005);
    // easeControl covers a fifth of the journey. The first frame shows motion.
    expect(control).toBeGreaterThan(0.2);
  });

  it('starts faster than easeFly across the whole first half', () => {
    for (let i = 1; i <= 50; i++) {
      const t = i / 100;
      expect(easeControl(t)).toBeGreaterThan(easeFly(t));
    }
  });

  it('still decelerates into the arrival rather than stopping dead', () => {
    // The last 10% of time should cover only a sliver of distance, or the camera
    // slams to a halt — the opposite failure from the one being fixed.
    const remaining = 1 - easeControl(0.9);
    expect(remaining).toBeLessThan(0.01);
    expect(easeControl(0.9)).toBeLessThan(1);
  });
});
