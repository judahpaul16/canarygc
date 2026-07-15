import { describe, it, expect } from 'vitest';
import { angleDelta, stepToward, alphaFor } from './smoothing';

describe('angleDelta', () => {
  it('takes the short way across 360', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });
  it('is zero for equal angles', () => {
    expect(angleDelta(199, 199)).toBe(0);
  });
  it('signs the turn direction', () => {
    expect(angleDelta(0, 90)).toBe(90);
    expect(angleDelta(0, 270)).toBe(-90);
  });
});

describe('stepToward', () => {
  it('closes the given fraction of the gap', () => {
    expect(stepToward(0, 10, 0.5)).toBe(5);
    expect(stepToward(0, 10, 1)).toBe(10);
    expect(stepToward(0, 10, 0)).toBe(0);
  });
});

describe('alphaFor', () => {
  it('closes more of the gap over a longer frame', () => {
    expect(alphaFor(0.032, 0.3)).toBeGreaterThan(alphaFor(0.016, 0.3));
  });
  it('is 1 for a zero time constant and stays within (0, 1]', () => {
    expect(alphaFor(1, 0)).toBe(1);
    const a = alphaFor(0.016, 0.3);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});
