# geodesy-globe

Geodetic maths and camera-flight logic for a real-scale Earth globe.

The architectural decision the rest follows from: the world frame is **ECEF
metres at real Earth scale**, not a unit "art sphere". three.js runs in float32,
and at planet scale float32 carries metres of jitter at ground level. So the
geodetic maths are done in float64 and only the *rebased* result (position minus
a nearby origin) is handed to the GPU.

## Use it

The `geodesy-globe/math` entry is the WGS84 conversions, and it pulls no
dependencies — not even three:

```ts
import { geodeticToEcef, ecefToGeodetic } from 'geodesy-globe/math';

// The Royal Observatory, Greenwich (lat, lon, altitude in metres) → ECEF metres.
const ecef = geodeticToEcef(51.4779, -0.0015, 46);
// → [3980601.155, -104.212, 4966867.44]

// …and straight back, recovering the input.
ecefToGeodetic(ecef[0], ecef[1], ecef[2]);
// → { latDeg: 51.4779, lonDeg: -0.0015, altM: 46 }
```

The main `geodesy-globe` entry adds the arc and flight helpers (`haversineKm`,
`sampleGreatCircle`, the fly-to maths) alongside the renderer-bound layer:

```ts
import { haversineKm, sampleGreatCircle } from 'geodesy-globe';

// Great-circle distance, London → New York. Note haversineKm takes [lng, lat].
haversineKm([-0.1278, 51.5074], [-74.006, 40.7128]);
// → 5570.2  (km)

// The minor arc, sampled — the short way round, so a Tokyo↔LA line crosses the
// Pacific rather than streaking back across Europe.
const arc = sampleGreatCircle(51.5074, -0.1278, 40.7128, -74.006, { segments: 64 });
arc.length;          // → 65 samples (segments + 1)
arc[32].latDeg;      // → 52.3684   the midpoint bows north over the Atlantic
arc[32].lonDeg;      // → -41.2903
```

Every number printed above is pinned against a literal in `src/example.test.ts`,
so the example and the code cannot drift apart without the suite going red.

## What is in here

- `geodesyMath.ts` — WGS84, geodetic to ECEF and back, the subsolar point.
  140 lines, **zero imports**.
- `geodesy.ts` — the renderer-bound layer: `OriginRebase`, sun direction,
  sphere-to-ECEF matrix. The only file that touches three.
- `greatCircle.ts` — arcs in the same geodetic frame as everything else.
- `flightPath.ts` / `flyCommand.ts` / `framing.ts` / `easing.ts` — the maths
  behind a fly-to: where the camera ends up, how it gets there, how it is framed.
- `homecoming.ts` — zero imports; arrival altitude.
- `autoRotate.ts` / `cameraPitch.ts` / `cameraTarget.ts` / `depthRange.ts` /
  `navGestures.ts` / `pitchCommand.ts` — camera behaviour.

## Consuming it

**This package ships TypeScript source, not a build.** `exports` points at
`src/index.ts`, so it runs under a TypeScript-aware runtime or bundler — `tsx`,
`vitest`, Vite, esbuild, Bun, Deno — and **not** under plain `node`, which
answers `ERR_UNKNOWN_FILE_EXTENSION` and is right to.

`three` is a **peer** dependency and only `geodesy.ts` imports it. Code that
wants the maths alone imports the `./math` subpath and never pulls three into
its bundle:

```ts
import { geodeticToEcef, ecefToGeodetic, WGS84 } from "geodesy-globe/math";

const [x, y, z] = geodeticToEcef(0, 0, 0);
// x === WGS84.a exactly: the semi-major axis, on the equator at the prime meridian
```

One asymmetry to know about, because it is surprising and the compiler is what
catches it: `geodeticToEcef` returns a **tuple** `[x, y, z]` while
`ecefToGeodetic` returns an **object** `{ latDeg, lonDeg, altM }`. Destructuring
the inverse as an array is a `TypeError` at runtime and a type error at compile
time. The shapes differ because the forward direction feeds straight into
vertex buffers where a tuple is what the caller wants, and the inverse is read
by people. Documented rather than changed, because changing it would break every
existing caller for tidiness.

## Test

```
npm install
npx vitest run
```

vitest reports 30 files, 263 passed.

## An assertion written in terms of its own constant cannot fail

That sentence is the most useful thing in this repository, and it cost a mutation
sweep to find. Seven constants could be changed with the whole suite staying
green, and it was one defect wearing seven hats:

```ts
expect(autoRotateSpeedFor(REFERENCE_ALT_KM)).toBeCloseTo(ORBITAL_SPEED)
```

Doubling `ORBITAL_SPEED` doubles both sides. The same shape hid the pitch
threshold, the framing clamp, and — worst — the WGS84 ellipsoid, where the polar
case asserted `z ≈ WGS84_B` and `WGS84_B` is derived from the flattening under
test.

`src/constants.test.ts` and `src/wgs84Conformance.test.ts` now name the numbers as
literals. They are deliberately brittle: a value that changes on purpose should
force a visible edit in the same commit.

While pinning them, one comment turned out to be false. `depthRange.EARTH_RADIUS_M`
said it matched `geodesyMath.EARTH_MEAN_RADIUS`. It does not — 6,371,008.8 is the
IUGG mean radius (2a+b)/3, and 6,371,000 is the nominal value used for
great-circle work. They differ by 8.8 m. Both are right for their own job; the
comment was wrong, and a test now pins the derivation instead of a claim.

## The poles were wrong by 6,399,593 metres

A red-team pass found `ecefToGeodetic(0, 0, WGS84_B)` — the north pole written
out by hand — returning an altitude of **−6,399,593 m**, with the latitude
correct beside it. The usual altitude formula is `p / cos(lat) − N`, and on the
axis `p` is exactly zero while `cos(90°)` is about 6e-17, so the whole term
vanishes and the altitude comes back as minus the prime vertical radius.

**The round-trip tests could never have found it.** `geodeticToEcef(90, 0, 0)`
yields a sub-nanometre x from `cos(90°)`, so `p` is tiny but non-zero and the
singular branch is skipped. Only a hand-built axis point reaches it — which is
precisely what a consumer of this package is most likely to type.

Fixed with the polar form, `|z| / |sin(lat)| − N(1 − e²)`, guarded on `p`. Both
directions are pinned: the four polar cases, and a control proving the branch
does not fire at the equator or mid-latitudes, where it would break everything.

## The ellipsoid is pinned, and it was not before

`src/wgs84Conformance.test.ts` exists because of a survived mutation. Changing
the flattening from 1/298.257223563 to 1/300 — a physically wrong ellipsoid that
displaces positions by up to ~135 m at mid-latitudes — left the entire suite
green.

Every existing check was blind to it, for three different reasons. The
equatorial cases are f-independent by definition. The polar case asserted
`z ≈ WGS84_B`, and `WGS84_B` is *derived* from `f`, so expected and actual moved
together and it could never fail. The round-trip cases are self-consistent under
any ellipsoid.

The conformance file anchors `a`, `1/f`, `b` and `e²` against the published
WGS84 values and pins three ECEF vectors away from the equator. It was driven
red against both mutations before being trusted.

## Two entry points

```ts
import { OriginRebase, geodeticToEcef } from 'geodesy-globe';       // pulls three
import { geodeticToEcef, WGS84 } from 'geodesy-globe/math';         // pulls nothing
```

`three` is a peer dependency and only `geodesy.ts` imports it, so code that needs
the maths alone can take the second door and never put three in its bundle.

That is a claim about a file, so a test asserts it: `index.test.ts` reads
`geodesyMath.ts` and fails if it ever grows an import. A README sentence cannot
fail; that check can.

## Mutation

A pass count says a suite runs. It does not say the suite would notice if the
code were wrong. So the mutations are committed rather than described:

```
npm run mutation
```

`mutations.json` lists nineteen changes to real logic. The runner applies each one,
runs the suite, restores the file and verifies the restore by hash. It reports
four verdicts, and the third is why it exists:

| verdict | meaning |
|---|---|
| `KILLED` | the suite ran and failed — the mutation is caught |
| `SURVIVED` | the suite ran and passed — nothing pins this behaviour |
| `INCONCLUSIVE` | non-zero exit, but no evidence any test ran |
| `NOT-APPLIED` | the pattern was absent, or matched more than once |

A mutation that stops the code compiling also exits non-zero. A runner reading
only the exit code scores that as a kill it never earned, so a spec declares a
marker the test runner prints only when tests actually execute, and a non-zero
exit without it is `INCONCLUSIVE` — never counted as caught.

The runner has its own suite (`npm run test:mutation-runner`), because a tool that measures test suites
is itself a check, and a check nobody has watched fail is a claim.

The nineteen include the two that originally survived unnoticed: the WGS84
flattening, and every constant whose assertion was written in terms of itself.

### The curated set is not a mutation score

Nineteen of nineteen is a perfect result against a list I wrote, and a perfect
result against your own list proves only that your imagination and your tests
agree. They always do. So the number below is the one worth reading:

```
npx stryker run
```

**660 generated mutants, 619 caught — 93.94%.** Stryker builds its own mutants
from the syntax tree rather than from a list, which is how you find the case
nobody thought to write down.

Per file, because an average hides where the work is:

| file | score |
|---|---|
| `autoRotate.ts`, `easing.ts`, `flyCommand.ts`, `navGestures.ts`, `pitchCommand.ts` | 100% |
| `geodesyMath.ts` | 97.89% |
| `greatCircle.ts` | 97.44% |
| `homecoming.ts` | 96.63% |
| `cameraPitch.ts` | 95.73% |
| `depthRange.ts` | 94.12% |
| `cameraTarget.ts` | 93.75% |
| `flightPath.ts` | 91.43% |
| `drawablePoint.ts` | 88.89% |
| `geodesy.ts` | 80.00% |
| `framing.ts` | 65.00% |

### `framing.ts` sits at 65% and it is not a coverage gap

An earlier version of this section called it one, and that was the wrong
reading. Of its fourteen open mutants, one is caught by an existing test and the
other **thirteen are equivalent**: no input distinguishes the mutated code from
the original, so no test can catch them and any test written to try would pass
either way. The function is guarded twice and the second guard makes the first
redundant, and the `π/2` clamp bound is never selected because the target
half-angle is always below it.

That was checked rather than argued: a differential sweep ran the original
against each mutant over a wide aspect-by-distance grid, including the exact
`fill == 1` crossover and the extremes `0`, `±Infinity` and `NaN`. Zero
differences anywhere.

**This is the known bias in every mutation score.** A generator counts an
equivalent mutant as a failure because it cannot tell one from a real gap, so a
score is a floor rather than a measurement. Naming where that bias lands is more
useful than quietly raising the number, and the correction is left visible here
rather than edited away.

`geodesy.ts` at 80% is the genuine remainder. It is the only file importing
`three`, which is what makes it hardest to reach from a plain test — a reason,
not an excuse.

A scheduled workflow re-runs the generator, so this table is measured rather
than remembered.

## Status

Extracted from an application globe. `three` is a peer dependency and only
`geodesy.ts` imports it, so code needing the maths alone can import
`geodesyMath` and never pull three into its bundle.

Two things were removed on extraction rather than carried, both because they were
about the application, not about geodesy.

One test asserted that two of the application's data modules both deferred to
these rules. It tested the callers, not the rules, and it reached into the
application's schema to do it. The removal is noted in the file it came from.

A name-formatting helper arrived because a test imported it. No source file in
this package ever used it, and it was briefly exported from the public barrel,
which would have put "format a person's display name" in the API of a geodesy
library. It and its two tests went back to the application.

There is a Swift port of the same maths. It is a **port**, not an independent
implementation, so the two agreeing is not cross-validation.

MIT licensed.
