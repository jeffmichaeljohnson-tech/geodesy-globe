import { describe, it, expect, beforeEach } from 'vitest';
import { requestPitch, takePitchRequest, clearPitchRequest } from './pitchCommand';

// pitchCommand shipped with no test at all, while its sibling flyCommand pins the
// identical mailbox contract. These assert the three properties the module header
// promises: last-write-wins, consume-once, and that 0 is a real request rather
// than an "empty" sentinel — the last is where a null-vs-0 mistake would hide,
// because the flat control (PITCH_FLAT_DEG) is exactly 0 degrees.
beforeEach(() => clearPitchRequest());

describe('pitchCommand — one-slot mailbox, last write wins', () => {
  it('returns null when nothing has been asked for', () => {
    expect(takePitchRequest()).toBeNull();
  });

  it('hands back the requested pitch', () => {
    requestPitch(55);
    expect(takePitchRequest()).toBe(55);
  });

  it('CONSUMES the request, so the rig acts on it exactly once at 60 Hz', () => {
    requestPitch(85);
    expect(takePitchRequest()).toBe(85);
    expect(takePitchRequest()).toBeNull();
  });

  it('LAST WRITE WINS — three taps of 2D do not walk the cycle three times', () => {
    requestPitch(55);
    requestPitch(85);
    requestPitch(0);
    expect(takePitchRequest()).toBe(0);
    expect(takePitchRequest()).toBeNull();
  });

  it('treats a 0-degree request as real, not as an empty mailbox', () => {
    // PITCH_FLAT_DEG is 0. A `pending || null` style take would swallow it and the
    // flat/2D control would silently do nothing. It must come back as 0, then null.
    requestPitch(0);
    expect(takePitchRequest()).toBe(0);
    expect(takePitchRequest()).toBeNull();
  });

  it('clearing drops an unread request, so a released anchor leaves nothing to act on', () => {
    requestPitch(55);
    clearPitchRequest();
    expect(takePitchRequest()).toBeNull();
  });

  it('clearing an already-empty mailbox is harmless', () => {
    clearPitchRequest();
    clearPitchRequest();
    expect(takePitchRequest()).toBeNull();
  });
});
