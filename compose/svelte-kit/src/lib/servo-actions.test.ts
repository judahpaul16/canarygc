import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SERVO_ACTIONS,
  RELEASE_CLOSE_PWM_US,
  RELEASE_CYCLE_DELAY_MS,
  RELEASE_OPEN_PWM_US,
  RELEASE_SERVO_CHANNEL,
  buildSteps,
  sanitizeServoActions
} from './servo-actions';

describe('servo action steps', () => {
  it('keeps the verified release as the default servo action', () => {
    const steps = buildSteps('servo', DEFAULT_SERVO_ACTIONS);
    expect(steps).toEqual([
      { command: 'DO_SET_SERVO', params: [RELEASE_SERVO_CHANNEL, RELEASE_OPEN_PWM_US] },
      {
        command: 'DO_SET_SERVO',
        params: [RELEASE_SERVO_CHANNEL, RELEASE_CLOSE_PWM_US],
        delayMsBefore: RELEASE_CYCLE_DELAY_MS
      }
    ]);
  });

  it('sends a single servo command when the cycle is off', () => {
    const values = {
      ...DEFAULT_SERVO_ACTIONS,
      servo: { channel: 5, pwm: 1900, cycle: false, cyclePwm: 1100, cycleDelayMs: 250 }
    };
    expect(buildSteps('servo', values)).toEqual([{ command: 'DO_SET_SERVO', params: [5, 1900] }]);
  });

  it('maps parachute actions onto DO_PARACHUTE parameters', () => {
    const base = DEFAULT_SERVO_ACTIONS;
    expect(buildSteps('parachute', { ...base, parachute: { action: 'release' } })).toEqual([
      { command: 'DO_PARACHUTE', params: [2] }
    ]);
    expect(buildSteps('parachute', { ...base, parachute: { action: 'enable' } })).toEqual([
      { command: 'DO_PARACHUTE', params: [1] }
    ]);
    expect(buildSteps('parachute', { ...base, parachute: { action: 'disable' } })).toEqual([
      { command: 'DO_PARACHUTE', params: [0] }
    ]);
  });

  it('maps gripper and relay actions onto their commands', () => {
    const base = DEFAULT_SERVO_ACTIONS;
    expect(buildSteps('gripper', { ...base, gripper: { instance: 2, action: 'grab' } })).toEqual([
      { command: 'DO_GRIPPER', params: [2, 1] }
    ]);
    expect(buildSteps('relay', { ...base, relay: { instance: 3, state: 'off' } })).toEqual([
      { command: 'DO_SET_RELAY', params: [3, 0] }
    ]);
  });

  it('maps winch actions onto DO_WINCH parameters', () => {
    const base = DEFAULT_SERVO_ACTIONS;
    expect(buildSteps('winch', base)).toEqual([{ command: 'DO_WINCH', params: [1, 4, 0, 0] }]);
    expect(
      buildSteps('winch', { ...base, winch: { instance: 2, action: 'length', lengthM: 8, rateMs: 0.5 } })
    ).toEqual([{ command: 'DO_WINCH', params: [2, 1, 8, 0.5] }]);
    expect(
      buildSteps('winch', { ...base, winch: { instance: 1, action: 'rate', lengthM: 8, rateMs: -2 } })
    ).toEqual([{ command: 'DO_WINCH', params: [1, 2, 0, -2] }]);
    expect(
      buildSteps('winch', { ...base, winch: { instance: 1, action: 'retract', lengthM: 8, rateMs: 2 } })
    ).toEqual([{ command: 'DO_WINCH', params: [1, 6, 0, 0] }]);
  });
});

describe('servo action persistence', () => {
  it('falls back to the defaults for missing or invalid stored values', () => {
    expect(sanitizeServoActions(null)).toEqual(DEFAULT_SERVO_ACTIONS);
    expect(sanitizeServoActions({ servo: { channel: 'x' }, parachute: { action: 'nope' } })).toEqual(
      DEFAULT_SERVO_ACTIONS
    );
  });

  it('keeps valid stored values', () => {
    const stored = sanitizeServoActions({
      servo: { channel: 7, pwm: 1200, cycle: false, cyclePwm: 1800, cycleDelayMs: 900 },
      relay: { instance: 4, state: 'off' }
    });
    expect(stored.servo).toEqual({ channel: 7, pwm: 1200, cycle: false, cyclePwm: 1800, cycleDelayMs: 900 });
    expect(stored.relay).toEqual({ instance: 4, state: 'off' });
    expect(stored.gripper).toEqual(DEFAULT_SERVO_ACTIONS.gripper);
  });

  it('sanitizes winch values', () => {
    expect(sanitizeServoActions({ winch: { action: 'nope', instance: 'x' } }).winch).toEqual(
      DEFAULT_SERVO_ACTIONS.winch
    );
    expect(
      sanitizeServoActions({ winch: { instance: 2, action: 'rate', lengthM: 3, rateMs: -1 } }).winch
    ).toEqual({ instance: 2, action: 'rate', lengthM: 3, rateMs: -1 });
  });
});
