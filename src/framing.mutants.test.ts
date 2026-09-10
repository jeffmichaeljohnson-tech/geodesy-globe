/**
 * framing.mutants.test.ts — the honest report on framing.ts's residual mutants.
 *
 * framing.ts is named in the README as a weak point at 65.00%. Working the open
 * mutants one by one, the finding is uncomfortable and worth stating plainly:
 *
 *   OF THE MUTANTS STILL OPEN, ALL ARE EQUIVALENT. The one open mutant that was
 *   NOT equivalent — the L68 guard forced to `if (true) return baseDist`, which
 *   would disable the pull-back entirely — is ALREADY killed by the existing
 *   "pulls back on a phone portrait viewport" test. The rest cannot be killed by
 *   any input, because the code is guarded twice and the second guard makes the
 *   first redundant:
 *
 *     L60  `if (!isFinite(aspect) || aspect <= 0) return baseDist`  (-> false / && / < 0)
 *     L61  `if (!isFinite(baseDist) || baseDist <= 1) return baseDist` (-> false / && / < 1)
 *          Every non-finite / non-positive aspect already reaches `baseDist` via the
 *          L68 guard (`targetHalfAngle <= 0` for any aspect <= 0, `NaN` for a
 *          non-finite one) and the `Math.max(baseDist, …)` floor (aspect = ∞ gives a
 *          fitted distance below baseDist, so the floor returns baseDist). Every
 *          baseDist <= 1 already reaches `baseDist` via the `fill >= 1` return
 *          (baseDist in (0,1] gives fill >= 1 or NaN). Removing either early guard
 *          changes nothing that the later code does not already do.
 *
 *     L66  `if (fill >= 1)` -> `fill > 1`
 *          Differs only when `fill` is EXACTLY 1.0, which needs
 *          `asin(1/baseDist)/halfFovX(1.6) === 1.0` bit-exactly — not reachable from
 *          any finite baseDist in IEEE754. (Swept the neighbourhood of the exact
 *          crossover baseDist ≈ 2.5336; no value distinguishes the two.)
 *
 *     L68  `if (!(targetHalfAngle > 0))` -> false / `>= 0`
 *          `targetHalfAngle = halfFovX(aspect) * fill`, and at this line aspect > 0
 *          (L60), baseDist > 1 (L61) so fill > 0 (L66 leaves fill in (0,1)); the
 *          product is therefore strictly > 0 and the guard never fires. Only the
 *          `-> true` form (always fire) changes behaviour, and that one is caught.
 *
 *     L70  `Math.min(targetHalfAngle, Math.PI/2 - 1e-9)` -> `PI/2 + 1e-9` / `PI*2`
 *          The clamp's second argument is only selected when
 *          `targetHalfAngle >= PI/2`. But `targetHalfAngle < halfFovX(aspect) < PI/2`
 *          for every finite aspect (fill < 1), so the bound is never chosen and its
 *          exact value cannot matter.
 *
 * This was confirmed two ways: a structural argument (above) and a differential
 * sweep of the original against each mutant over a wide grid of aspect and baseDist
 * (including the crossover baseDist and the extremes 0, ±∞, NaN, 1e-9, 1e6) — zero
 * differences. So there are NO new killing tests to write for framing.ts without
 * changing the source, and inventing assertions that "pass on both" would be exactly
 * the tautology this repository was burned by.
 *
 * What this file adds instead is genuine, falsifiable coverage of the fit INVARIANT
 * — the property the equivalent-guard mutants leave untouched but a real arithmetic
 * change to the core formula would break. These can fail; that is the bar.
 */
import { describe, expect, it } from 'vitest';
import { FOV_Y_RAD, REF_ASPECT, fitDistanceForAspect } from './framing';

const BASE = 2.7;
const halfFovX = (aspect: number) => Math.atan(Math.tan(FOV_Y_RAD / 2) * aspect);

describe('fitDistanceForAspect — the fit invariant, stated independently of the code', () => {
  it('preserves the globe fill fraction: asin(1/d) / halfFovX(aspect) is constant across aspects', () => {
    // The whole promise of the function, expressed as a relationship rather than a
    // pinned number: whatever distance it returns, the globe's angular radius as a
    // fraction of the horizontal half-field must equal the fraction at REF_ASPECT.
    // Independent of the returned value — a real change to the core arithmetic
    // (which the equivalent guard-mutants do NOT touch) breaks this.
    const refFraction = Math.asin(1 / BASE) / halfFovX(REF_ASPECT);
    for (const aspect of [0.462, 0.75, 1.0, 1.246, 1.6]) {
      const d = fitDistanceForAspect(aspect, BASE);
      const fraction = Math.asin(1 / d) / halfFovX(aspect);
      // Only meaningful where the fit actually applied (d pulled back past BASE) or
      // sat exactly at BASE (wide viewport). Both must land on the same fraction.
      expect(fraction).toBeCloseTo(refFraction, 9);
    }
  });

  it('the returned distance solves sin(halfFovX(aspect) * fill) = 1/d, so d is not free', () => {
    // A second, self-contained check on the arithmetic: reconstruct the target
    // half-angle from REF_ASPECT and assert the returned distance is exactly the one
    // whose angular radius equals it. Tolerance 1e-9 rad: far tighter than the ~0.001
    // the framing tolerates on screen, so a genuine formula drift cannot hide.
    const fill = Math.asin(1 / BASE) / halfFovX(REF_ASPECT);
    // Aspects chosen so the fitted distance stays below MAX_FIT_DIST (12): a narrower
    // aspect than ~0.34 clamps there, and the clamp legitimately breaks this invariant.
    for (const aspect of [0.462, 0.6, 0.8, 1.2]) {
      const d = fitDistanceForAspect(aspect, BASE);
      const targetHalfAngle = halfFovX(aspect) * fill;
      expect(Math.asin(1 / d)).toBeCloseTo(targetHalfAngle, 9);
    }
  });

  it('NEGATIVE CONTROL: a wrong distance fails the invariant', () => {
    // Proves the invariant above can fail — it is not vacuously true. Feed it a
    // distance 5% off what the function returns and the fraction no longer matches.
    const aspect = 0.5;
    const d = fitDistanceForAspect(aspect, BASE);
    const refFraction = Math.asin(1 / BASE) / halfFovX(REF_ASPECT);
    const wrongFraction = Math.asin(1 / (d * 1.05)) / halfFovX(aspect);
    expect(Math.abs(wrongFraction - refFraction)).toBeGreaterThan(1e-3);
  });
});
