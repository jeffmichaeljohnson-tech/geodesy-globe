# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository —
**Security → Advisories → Report a vulnerability**, or go straight to
[`../../security/advisories/new`](../../security/advisories/new). That channel is
private between you and the maintainer, and it is the only one that stays private.

**Please do not open a public issue for a suspected vulnerability.** If private
reporting is not available to you, open an issue saying only that you have a
security report and asking for a private channel. No details in the issue.

This project is maintained by one person, not a team with an on-call rotation. A
realistic expectation: acknowledgement within a week, an assessment within two.
If a report is valid, the fix and the advisory are published together, and you
are credited unless you ask not to be.

There is no bounty. Saying so plainly is more useful than leaving you to guess.

## Supported versions

The default branch is the only supported version. This project has not cut a
release series, so there is nothing to backport to.

## Threat model — read this before deciding whether you have a finding

This is a pure-computation library: WGS84 geodesy, camera framing and easing
for a 3D globe. It opens no socket, reads no file, touches no credential and
holds no state between calls. **That makes its realistic security surface small,
and this section exists to say so honestly rather than to manufacture one.**

**In scope.**

- **An input that causes a hang.** An unbounded or non-terminating loop for some
  coordinate, bearing or interpolation parameter. A frame loop that stops is a
  real availability problem for whatever embeds this.
- **A panic or throw on an input a caller may plausibly pass** — a pole, the
  antimeridian, an identical pair of points, a zero-length path, a NaN arriving
  from user input upstream.
- **NaN or Infinity propagating out of a function that returns a number**, where
  a caller would reasonably treat the result as a valid coordinate. Silent
  numeric corruption crossing an API boundary is the one way a maths library
  causes someone else's incident.
- Anything that makes a documented invariant untrue in a way a caller depends on
  — a great-circle distance that is not symmetric, an interpolation that leaves
  the ellipsoid, an easing function that escapes `[0, 1]`.

**Out of scope.**

- Precision. This library computes in float64 and says so; a disagreement in the
  last places against a higher-precision reference is a correctness issue, not a
  security one. Open a normal issue with the reference implementation you
  compared against — that is a welcome report, just not a private one.
- The choice of ellipsoid, or the decision to model the Earth as one.
- Rendering behaviour of any downstream 3D engine.

**Standing properties.** No runtime dependencies. No I/O of any kind. Every
exported function is deterministic: the same arguments give the same result, on
any machine, at any time, in any timezone — the suite is run across a 25-hour
timezone spread to keep that true.
