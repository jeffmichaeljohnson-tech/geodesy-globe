# geodesy-globe

Geodetic maths and camera-flight logic for a real-scale Earth globe.

The architectural decision the rest follows from: the world frame is **ECEF
metres at real Earth scale**, not a unit "art sphere". three.js runs in float32,
and at planet scale float32 carries metres of jitter at ground level. So the
geodetic maths are done in float64 and only the *rebased* result (position minus
a nearby origin) is handed to the GPU.

## What is in here

- `geodesyMath.ts` — WGS84, geodetic to ECEF and back, the subsolar point.
  122 lines, **zero imports**.
- `geodesy.ts` — the renderer-bound layer: `OriginRebase`, sun direction,
  sphere-to-ECEF matrix. The only file that touches three.
- `greatCircle.ts` — arcs in the same geodetic frame as everything else.
- `flightPath.ts` / `flyCommand.ts` / `framing.ts` / `easing.ts` — the maths
  behind a fly-to: where the camera ends up, how it gets there, how it is framed.
- `homecoming.ts` — zero imports; arrival altitude.
- `autoRotate.ts` / `cameraPitch.ts` / `cameraTarget.ts` / `depthRange.ts` /
  `navGestures.ts` / `pitchCommand.ts` — camera behaviour.

## Test

```
npm install
npx vitest run
```

vitest reports 15 files, 192 passed.

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
great-circle work. They differ by 8.77 m. Both are right for their own job; the
comment was wrong, and a test now pins the derivation instead of a claim.

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

## Status

Extracted from an application globe. `three` is a peer dependency and only
`geodesy.ts` imports it, so code needing the maths alone can import
`geodesyMath` and never pull three into its bundle.

One test was removed on extraction rather than carried: it asserted that two of
the application's data modules both deferred to these rules, which tested the
callers rather than the rules. The removal is noted in the file it came from.

There is a Swift port of the same maths. It is a **port**, not an independent
implementation, so the two agreeing is not cross-validation.

MIT licensed.
