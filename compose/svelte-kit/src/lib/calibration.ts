import { get } from 'svelte/store';
import { mavModelStore } from '../stores/mavlinkStore';
import { isPX4 } from './flight-modes';

export type CalKind = 'gyro' | 'accel' | 'level' | 'compass';

export interface CalCommand {
  command: string;
  params: number[];
  cmdLong: boolean;
}

// The six accelerometer orientations, in the order PX4 and Mission Planner
// prompt for them. The page highlights whichever the autopilot asks for.
export const ACCEL_POSITIONS = ['level', 'left', 'right', 'nosedown', 'noseup', 'back'] as const;
export type AccelPosition = (typeof ACCEL_POSITIONS)[number];

export const ACCEL_POSITION_LABEL: Record<AccelPosition, string> = {
  level: 'Level',
  left: 'On its left side',
  right: 'On its right side',
  nosedown: 'Nose down',
  noseup: 'Nose up',
  back: 'On its back'
};

// PREFLIGHT_CALIBRATION param slots: [gyro, mag, groundPressure, radio, accel,
// ?, ?]. accel = 1 runs the full 6-position routine; accel = 2 runs the level
// horizon trim. Both stacks accept this shape.
function preflight(slot: number, value = 1): CalCommand {
  const params = [0, 0, 0, 0, 0, 0, 0];
  params[slot] = value;
  return { command: 'PREFLIGHT_CALIBRATION', params, cmdLong: true };
}

// The MAVLink command each calibration issues for the connected autopilot. PX4
// runs its compass onboard through PREFLIGHT_CALIBRATION; ArduPilot uses the
// dedicated DO_START_MAG_CAL so it can stream MAG_CAL progress.
export function calCommand(kind: CalKind, model: string = get(mavModelStore)): CalCommand {
  switch (kind) {
    case 'gyro':
      return preflight(0);
    case 'accel':
      return preflight(4, 1);
    case 'level':
      return preflight(4, 2);
    case 'compass':
      return isPX4(model)
        ? preflight(1)
        : { command: 'DO_START_MAG_CAL', params: [0, 0, 1, 0, 0, 0, 0], cmdLong: true };
  }
}

export interface CalStatus {
  text: string;
  progress?: number;
  orientation?: string;
  done?: boolean;
  failed?: boolean;
}

// PX4 (and ArduPilot) narrate accelerometer and level calibration through
// STATUSTEXT lines tagged "[cal]", carrying a percent, the orientation to hold,
// and a done/failed terminal line.
export function parseCalStatustext(text: string): CalStatus | null {
  if (!/\[cal\]/i.test(text)) return null;
  const s: CalStatus = { text: text.replace(/.*\[cal\]\s*/i, '[cal] ') };
  const prog = text.match(/progress\s*<?(\d+)>?/i);
  if (prog) s.progress = Math.min(100, parseInt(prog[1], 10));
  const orient = text.match(/orientation:?\s*([a-z]+)/i);
  if (orient) s.orientation = orient[1].toLowerCase();
  if (/\b(done|success|complete[d]?)\b/i.test(text)) s.done = true;
  if (/\bfail(ed)?\b/i.test(text)) s.failed = true;
  return s;
}

export interface MagCalProgress {
  completionPct: number;
}

// ArduPilot MAG_CAL_PROGRESS carries completionPct 0..100 per compass.
export function parseMagCalProgress(text: string): MagCalProgress | null {
  const m = text.match(/"completionPct":"?(\d+)/);
  if (!m) return null;
  return { completionPct: Math.min(100, parseInt(m[1], 10)) };
}

// ArduPilot MAG_CAL_REPORT calStatus: 4 = success, 5 = failed (MAG_CAL_SUCCESS
// / MAG_CAL_FAILED in the enum).
export function parseMagCalReport(text: string): { done: boolean; failed: boolean } | null {
  const m = text.match(/"calStatus":"?(\d+)/);
  if (!m) return null;
  const status = parseInt(m[1], 10);
  return { done: status === 4, failed: status === 5 };
}
