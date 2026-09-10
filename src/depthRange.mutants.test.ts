/**
 * depthRange.mutants.test.ts — closing the reachable arithmetic mutant in `far`.
 *
 *   L90 `horizonDistanceM(alt, radiusM) * 1.6 -> / 1.6`. The horizon multiplier only
 *   determines `far` in the altitude band where the horizon term is the binding one:
 *   above the near*1000 floor and below the global-far cap. The existing tests probe
 *   500 m (where the near*1000 floor wins) and orbit (also floor-bound), so the horizon
 *   term never decides `far` and the mutant survives. At ~1 km the horizon term binds,
 *   and `far` must equal 1.6 * horizon there.
 *
 * The two L92 global-far mutants split, and the split is worth stating exactly:
 *   - `distToCentreM + 3*radiusM -> distToCentreM - 3*radiusM` IS caught by the ~1 km
 *     test below: it makes global-far NEGATIVE (≈ -2R), so `Math.min(globalFar, horizon)`
 *     becomes that negative value and `far` collapses to the near*1000 floor instead of
 *     tracking the horizon. Not equivalent — a real change to `far`.
 *   - `3 * radiusM -> 3 / radiusM` IS equivalent: global-far stays ≈ distToCentreM
 *     (adding ~5e-7 m), which is still far larger than the horizon term across the whole
 *     descent, so `Math.min` always drops it. Swept orbit-to-surface: with the ORIGINAL
 *     sign, global-far is never the binding value (near*1000 = alt*150 exceeds it above
 *     ~171 km, the horizon term is smaller below that), so this variant never shows.
 */
import { describe, expect, it } from 'vitest';
import { depthRangeFor, EARTH_RADIUS_M, horizonDistanceM } from './depthRange';

const R = EARTH_RADIUS_M;

describe('depthRangeFor — far follows the horizon in the band where the horizon binds', () => {
  it('at ~1 km, far is exactly 1.6 * the horizon distance (catches *1.6 -> /1.6)', () => {
    // At 1 km: near*1000 = 150 km, global-far ≈ 25,000 km, and 1.6*horizon ≈ 180.6 km
    // is the middle value that Math.max/Math.min select. The independent oracle is the
    // horizon formula itself. The `/1.6` mutant makes the horizon term (~113 km) fall
    // below the 150 km floor, so far snaps to 150 km — a value it must not take here.
    const { far } = depthRangeFor(1_000, R + 1_000);
    expect(far).toBeCloseTo(horizonDistanceM(1_000) * 1.6, 6);
    expect(far).toBeGreaterThan(160_000); // and well clear of the 150 km near*1000 floor
  });

  it('CONTROL: on the surface the near*1000 floor wins, so far is decoupled from horizon', () => {
    // Confirms the band matters and the oracle above is not universal: at altitude 0 the
    // horizon distance is 0, so neither horizon nor global-far can set `far` — the
    // near*1000 floor does. This is the must-not-fire side of the horizon-binding claim.
    const { far, near } = depthRangeFor(0, R);
    expect(far).toBe(near * 1000);
  });
});
