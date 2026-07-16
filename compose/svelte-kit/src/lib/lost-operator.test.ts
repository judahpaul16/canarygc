import { describe, expect, it } from 'vitest';
import { lostOperatorTriggers, type LostOperatorInput } from './lost-operator';

const NOW = 1_000_000_000;

function input(overrides: Partial<LostOperatorInput> = {}): LostOperatorInput {
  return {
    minutes: 5,
    clients: 0,
    lastSeenAt: NOW - 6 * 60_000,
    fired: false,
    armed: true,
    linkUp: true,
    now: NOW,
    ...overrides
  };
}

describe('lostOperatorTriggers', () => {
  it('fires once the window elapses with no operator on an armed vehicle', () => {
    expect(lostOperatorTriggers(input())).toBe(true);
  });

  it('stays off when disabled', () => {
    expect(lostOperatorTriggers(input({ minutes: 0 }))).toBe(false);
  });

  it('holds while any operator stream is open', () => {
    expect(lostOperatorTriggers(input({ clients: 1 }))).toBe(false);
  });

  it('holds before the window elapses', () => {
    expect(lostOperatorTriggers(input({ lastSeenAt: NOW - 4 * 60_000 }))).toBe(false);
  });

  it('fires exactly at the window boundary', () => {
    expect(lostOperatorTriggers(input({ lastSeenAt: NOW - 5 * 60_000 }))).toBe(true);
  });

  it('holds when the vehicle is disarmed or the link is down', () => {
    expect(lostOperatorTriggers(input({ armed: false }))).toBe(false);
    expect(lostOperatorTriggers(input({ linkUp: false }))).toBe(false);
  });

  it('fires only once per outage', () => {
    expect(lostOperatorTriggers(input({ fired: true }))).toBe(false);
  });

  it('holds with no presence baseline', () => {
    expect(lostOperatorTriggers(input({ lastSeenAt: 0 }))).toBe(false);
  });
});
