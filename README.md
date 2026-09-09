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

vitest reports 13 files, 180 passed.

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
