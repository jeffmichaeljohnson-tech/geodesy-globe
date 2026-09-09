import { describe, it, expect, beforeEach } from 'vitest';
import { requestFly, takeFlyRequest, clearFlyRequest, type FlyRequest } from './flyCommand';

const req = (over: Partial<FlyRequest> = {}): FlyRequest => ({
  latDeg: 42.33, lonDeg: -83.05, altitudeM: 74_600, durationMs: 1300, reason: 'homecoming', ...over,
});

beforeEach(() => clearFlyRequest());

describe('flyCommand — the same contract as pitchCommand', () => {
  it('returns null when nothing has been asked for', () => {
    expect(takeFlyRequest()).toBeNull();
  });

  it('hands back what was requested', () => {
    const r = req();
    requestFly(r);
    expect(takeFlyRequest()).toEqual(r);
  });

  it('CONSUMES the request, so a flight begins exactly once at 60 Hz', () => {
    requestFly(req());
    expect(takeFlyRequest()).not.toBeNull();
    expect(takeFlyRequest()).toBeNull();
  });

  it('LAST WRITE WINS — tapping out then straight back in means the second thing', () => {
    requestFly(req({ reason: 'to-globe', altitudeM: 10_830_000 }));
    requestFly(req({ reason: 'to-ground', altitudeM: 74_600 }));
    const taken = takeFlyRequest();
    expect(taken?.reason).toBe('to-ground');
    expect(taken?.altitudeM).toBe(74_600);
  });

  it('clearing drops an unread request, so a permalink can win over a queued homecoming', () => {
    requestFly(req({ reason: 'homecoming' }));
    clearFlyRequest();
    expect(takeFlyRequest()).toBeNull();
  });

  it('clearing when empty is harmless', () => {
    clearFlyRequest();
    clearFlyRequest();
    expect(takeFlyRequest()).toBeNull();
  });
});
