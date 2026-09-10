/**
 * drawablePoint.mutants.test.ts — closing the one reachable mutant, documenting four
 * that the next guard makes equivalent.
 *
 * The type guard on line 26 exists for JavaScript callers (the schema this rule was
 * extracted from can hand it anything). Its FIVE mutants split:
 *
 *   REACHABLE (BooleanLiteral `return false -> return true`, NoCoverage): with a
 *   non-numeric argument the guard fires and must reject. No existing test passes a
 *   non-number, so nothing pinned the rejection. Closed below (with a cast, because the
 *   guard's whole reason to exist is inputs the type says cannot happen).
 *
 *   EQUIVALENT (the ConditionalExpression `-> false` forms and the LogicalOperator
 *   `|| -> &&`): removing or weakening the typeof guard changes nothing, because the
 *   NEXT line — `if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false` —
 *   rejects every non-number too (Number.isFinite is false for any non-number and does
 *   not coerce). So a non-number that slips past a disabled typeof guard is caught one
 *   line later with the same verdict. Only the `return false -> return true` form, which
 *   flips the verdict WHILE the guard still fires, is observable.
 */
import { describe, expect, it } from 'vitest';
import { isDrawablePoint } from './drawablePoint';

describe('isDrawablePoint rejects non-numeric coordinates (the type guard must reject)', () => {
  it('a non-number in either slot is not drawable (catches return false -> true)', () => {
    // The guard's purpose: a JS caller passing a string/object/null must be refused,
    // not accepted. Casts are used because the guard exists precisely for values the
    // TypeScript signature forbids.
    expect(isDrawablePoint('42' as unknown as number, 0)).toBe(false);
    expect(isDrawablePoint(0, '10' as unknown as number)).toBe(false);
    expect(isDrawablePoint({} as unknown as number, 10)).toBe(false);
    expect(isDrawablePoint(10, null as unknown as number)).toBe(false);
  });

  it('CONTROL: a genuine numeric coordinate is still drawable', () => {
    // Ensures the rejection above is specific to non-numbers, not a blanket false.
    expect(isDrawablePoint(42.3314, -83.0458)).toBe(true);
  });
});
