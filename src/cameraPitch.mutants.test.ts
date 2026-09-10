/**
 * cameraPitch.mutants.test.ts — closing the open mutants the pole-aligned tests miss.
 *
 * The existing suite exercises the maths almost entirely with `up = [0,0,1]` (the
 * north pole) plus one Manhattan round-trip. A pole-aligned up hides a whole family of
 * mutants because two of its three components are zero and its length is exactly 1:
 *
 *   L93  `dot(offset, up) / (lo * lu) -> / (lo / lu)`  is invisible whenever |up| = 1,
 *        because lo*lu = lo/lu there. A non-unit up separates them.
 *   L152 `if (length(u) === 0) return offset -> false` needs a genuinely zero-length up.
 *   L75  `normalize`'s `l === 0 ? [0,0,0] : […]` (array `-> []`, and cond `-> false`)
 *        is only reached through the fallback heading; a zero fallback exposes both.
 *   L161 the Gram-Schmidt terms `f[i] - u[i]*fAlong -> + …` (indices 0 and 1) vanish
 *        when u[0] = u[1] = 0. A real (non-axis) up with a fallback that has an
 *        up-component is what makes the orthogonalisation observable.
 *   L201 `nadirOffset[i] / c -> * c` (indices 0 and 2) vanish when the nadir offset is
 *        along a single axis. A real up gives the offset three non-zero components.
 *
 * NOT written, and why equivalent:
 *   L150 `if (d === 0) return offset -> false`: when d = 0 the continuation multiplies
 *        everything by d (cu = cos*d, ch = sin*d), so it returns [0,0,0] = the offset
 *        anyway. No input distinguishes them.
 *   L158 `length(h) < d*1e-6 -> <=`: differs only when length(h) is EXACTLY d*1e-6, a
 *        measure-zero coincidence no constructed input reaches.
 *   L200 `if (!(c > 1e-3)) … -> false` / `>= 1e-3`: clampPitchDeg caps pitch at 85°, so
 *        c = cos(85°) ≈ 0.087 is never ≤ 1e-3 and the guard never fires. (The `-> true`
 *        form, which WOULD skip the 1/cos altitude scaling, is already caught by the
 *        existing "PRESERVES the altitude" test.)
 */
import { describe, expect, it } from 'vitest';
import { arrivalOffsetForPitch, offsetForPitch, pitchDegFor, type Vec3 } from './cameraPitch';

const DEG = 180 / Math.PI;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Local up at a real ECEF surface point (all three components non-zero, unit length). */
function ecefUp(latDeg: number, lonDeg: number): Vec3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}
/** A horizontal (east) unit vector at that point, perpendicular to up. */
function ecefEast(lonDeg: number): Vec3 {
  const lon = (lonDeg * Math.PI) / 180;
  return [-Math.sin(lon), Math.cos(lon), 0];
}

const MANHATTAN = ecefUp(40.7128, -74.006);
const EAST = ecefEast(-74.006);

describe('pitchDegFor is the angle between offset and up, at ANY up magnitude', () => {
  it('does not depend on |up| — the ratio must normalise by lo*lu, not lo/lu', () => {
    // [1,0,1] is 45° off the vertical [0,0,1]. Scaling up to [0,0,2] must not change
    // that — pitch is an angle. The `/(lo*lu) -> /(lo/lu)` mutant collapses it to 0°
    // for the doubled up because the two length factors stop cancelling.
    expect(pitchDegFor([1, 0, 1], [0, 0, 1])).toBeCloseTo(45, 9);
    expect(pitchDegFor([1, 0, 1], [0, 0, 2])).toBeCloseTo(45, 9);
    expect(pitchDegFor([1, 0, 1], [0, 0, 5])).toBeCloseTo(45, 9);
    // NEGATIVE CONTROL: a genuinely different geometry gives a different angle.
    expect(pitchDegFor([5, 0, 0], [0, 0, 2])).toBeCloseTo(90, 9);
  });
});

describe('offsetForPitch degenerate guards, seen through a real frame', () => {
  it('returns the offset unchanged when up is the zero vector', () => {
    // L152 guard removed -> it would carry on with a NaN-laden normalise and emit a
    // non-offset vector. A zero-length up has no defined tilt; the offset is the answer.
    const start: Vec3 = [300, 0, 900];
    expect(offsetForPitch(start, [0, 0, 0], 55, [1, 0, 0])).toEqual(start);
  });

  it('returns the offset unchanged when the fallback heading is also degenerate (zero)', () => {
    // Overhead offset -> the fallback path runs; a zero fallback means normalise hits
    // its l===0 branch. If that branch returns [] (array mutant) or is skipped (cond
    // mutant), the result is NaN instead of the offset. The screen would blank.
    const start: Vec3 = [0, 0, 1000];
    expect(offsetForPitch(start, [0, 0, 1], 55, [0, 0, 0])).toEqual(start);
  });

  it('orthogonalises the fallback heading against up (real frame, up-tilted fallback)', () => {
    // Overhead over Manhattan, with a fallback that deliberately carries an up-component
    // (up*1000 + east*100). Gram-Schmidt must strip that up-component so the tilt lands
    // at exactly the requested angle. The `f[i] - u[i]*fAlong -> +` mutants leave an
    // up-component in the heading, so the measured pitch drifts off 55°.
    const start: Vec3 = [MANHATTAN[0] * 3000, MANHATTAN[1] * 3000, MANHATTAN[2] * 3000];
    const fallback: Vec3 = [
      MANHATTAN[0] * 1000 + EAST[0] * 100,
      MANHATTAN[1] * 1000 + EAST[1] * 100,
      MANHATTAN[2] * 1000 + EAST[2] * 100,
    ];
    const o = offsetForPitch(start, MANHATTAN, 55, fallback);
    expect(pitchDegFor(o, MANHATTAN)).toBeCloseTo(55, 6);
    // distance is preserved regardless
    expect(len(o)).toBeCloseTo(3000, 6);
  });
});

describe('arrivalOffsetForPitch preserves altitude in a real (non-axis) frame', () => {
  it('keeps the flown altitude when the nadir offset has three non-zero components', () => {
    // Nadir over Manhattan: offset along the real up, so all three components are
    // non-zero. The 1/cos scaling must be applied UNIFORMLY (nadir[i]/c). The
    // `nadir[0]*c` / `nadir[2]*c` mutants scale two axes the wrong way, tilting the
    // scaled vector off `up`, and the recovered altitude no longer matches.
    for (const altM of [50_000, 120_000, 300_000]) {
      const nadir: Vec3 = [MANHATTAN[0] * altM, MANHATTAN[1] * altM, MANHATTAN[2] * altM];
      const o = arrivalOffsetForPitch(nadir, MANHATTAN, 45, EAST);
      // vertical (along-up) component == the altitude it was flown to.
      expect(dot(o, MANHATTAN)).toBeCloseTo(altM, 3);
      // and it is genuinely tilted to the requested pitch.
      expect(pitchDegFor(o, MANHATTAN)).toBeCloseTo(45, 6);
    }
  });

  it('NEGATIVE CONTROL: cos(pitch) of the altitude is NOT preserved (that was the bug)', () => {
    // Guards the assertion above against becoming vacuous: a plain offsetForPitch (no
    // 1/cos scaling) would keep only cos(45)=0.707 of the altitude, which must NOT pass.
    const altM = 120_000;
    const nadir: Vec3 = [MANHATTAN[0] * altM, MANHATTAN[1] * altM, MANHATTAN[2] * altM];
    const plain = offsetForPitch(nadir, MANHATTAN, 45, EAST);
    expect(dot(plain, MANHATTAN)).toBeLessThan(altM * 0.8);
  });
});
