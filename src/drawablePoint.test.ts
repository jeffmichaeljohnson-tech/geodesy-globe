import { describe, expect, it } from 'vitest';
import { isDrawablePoint } from './drawablePoint';
import { personLabel, UNNAMED } from './personLabel';

describe('isDrawablePoint', () => {
  it('accepts an ordinary coordinate', () => {
    expect(isDrawablePoint(42.3314, -83.0458)).toBe(true);
  });

  it('rejects the (0,0) sentinel', () => {
    // This app stores POINT(0 0) for a prayer with no location, and it is also
    // the classic failed-geocode signature. Drawn, it becomes a light in the
    // Gulf of Guinea claiming to be a person.
    expect(isDrawablePoint(0, 0)).toBe(false);
  });

  it('accepts real coordinates that merely have a zero component', () => {
    // Rejecting either component alone would erase the equator and the prime
    // meridian — a band of the planet, including London.
    expect(isDrawablePoint(0, 30)).toBe(true);
    expect(isDrawablePoint(51.5, 0)).toBe(true);
  });

  it('rejects non-finite values', () => {
    expect(isDrawablePoint(Number.NaN, 10)).toBe(false);
    expect(isDrawablePoint(10, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isDrawablePoint(10, Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(isDrawablePoint(91, 0)).toBe(false);
    expect(isDrawablePoint(-91, 0)).toBe(false);
    expect(isDrawablePoint(0, 181)).toBe(false);
    expect(isDrawablePoint(0, -181)).toBe(false);
  });

  it('accepts the exact poles and the antimeridian', () => {
    expect(isDrawablePoint(90, 180)).toBe(true);
    expect(isDrawablePoint(-90, -180)).toBe(true);
  });
});

describe('personLabel', () => {
  it('names someone when a name exists', () => {
    expect(personLabel('Ashleigh P.')).toBe('Ashleigh P.');
  });

  it('falls back for null, undefined, empty and whitespace', () => {
    // Whitespace matters: a display_name of "   " must not render as an empty
    // gap where a person's name belongs — that reads as a rendering bug.
    for (const v of [null, undefined, '', '   ', '\n\t']) {
      expect(personLabel(v)).toBe(UNNAMED);
    }
  });
});

// REMOVED ON EXTRACTION: a describe block asserting that two application data
// modules both defer to these shared drawability rules. It tested the callers,
// not the rules, and it reached into the application's data layer and schema.
// That check belongs in the application it guards, and it stays there.
