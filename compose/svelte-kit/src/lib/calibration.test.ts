import { describe, it, expect } from 'vitest';
import {
  calCommand,
  parseCalStatustext,
  parseMagCalProgress,
  parseMagCalReport
} from './calibration';

describe('calibration commands per autopilot', () => {
  it('runs gyro via PREFLIGHT_CALIBRATION param1', () => {
    expect(calCommand('gyro', 'PX4')).toEqual({
      command: 'PREFLIGHT_CALIBRATION',
      params: [1, 0, 0, 0, 0, 0, 0],
      cmdLong: true
    });
  });

  it('runs accel via PREFLIGHT_CALIBRATION param5=1', () => {
    expect(calCommand('accel', 'ArduPilotMega').params).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it('runs level via PREFLIGHT_CALIBRATION param5=2', () => {
    expect(calCommand('level', 'PX4').params).toEqual([0, 0, 0, 0, 2, 0, 0]);
  });

  it('runs PX4 compass onboard through PREFLIGHT_CALIBRATION', () => {
    expect(calCommand('compass', 'PX4')).toEqual({
      command: 'PREFLIGHT_CALIBRATION',
      params: [0, 1, 0, 0, 0, 0, 0],
      cmdLong: true
    });
  });

  it('runs ArduPilot compass through DO_START_MAG_CAL', () => {
    expect(calCommand('compass', 'ArduPilotMega').command).toBe('DO_START_MAG_CAL');
  });
});

describe('calibration status parsing', () => {
  it('reads progress and orientation from a [cal] STATUSTEXT', () => {
    const s = parseCalStatustext('STATUSTEXT(...)::[cal] progress <42>')!;
    expect(s.progress).toBe(42);
    const o = parseCalStatustext('[cal] orientation: left')!;
    expect(o.orientation).toBe('left');
  });

  it('flags a done and a failed [cal] line', () => {
    expect(parseCalStatustext('[cal] calibration done: accel')!.done).toBe(true);
    expect(parseCalStatustext('[cal] calibration failed: mag')!.failed).toBe(true);
  });

  it('ignores a STATUSTEXT that is not a cal line', () => {
    expect(parseCalStatustext('Preflight check OK')).toBeNull();
  });

  it('reads MAG_CAL_PROGRESS completion and MAG_CAL_REPORT status', () => {
    expect(parseMagCalProgress('{"completionPct":73}')!.completionPct).toBe(73);
    expect(parseMagCalReport('{"calStatus":4}')).toEqual({ done: true, failed: false });
    expect(parseMagCalReport('{"calStatus":5}')).toEqual({ done: false, failed: true });
  });
});
