// Subpath imports keep the whole app on one prebundled copy of the mappings;
// mixing them with the package root makes Vite optimize the dependency twice
// and split the module graph across versions.
import { MavCmd as CommonMavCmd } from 'mavlink-mappings/dist/lib/common';
import { MavCmd as ArduMavCmd } from 'mavlink-mappings/dist/lib/ardupilotmega';
import { get } from 'svelte/store';
import { mavModelStore } from '../stores/mavlinkStore';
import { isPX4 } from './flight-modes';

export interface ConsoleCommand {
  name: string;
  ardu: boolean;
}

const COMMON_COMMANDS = Object.keys(CommonMavCmd)
  .filter((k) => isNaN(Number(k)))
  .sort();
const ARDU_COMMANDS = Object.keys(ArduMavCmd)
  .filter((k) => isNaN(Number(k)))
  .sort();

// The command set follows the detected autopilot: the ArduPilot-specific
// dialect only exists off PX4.
export function commandCatalog(model: string = get(mavModelStore)): ConsoleCommand[] {
  const list: ConsoleCommand[] = COMMON_COMMANDS.map((name) => ({ name, ardu: false }));
  if (!isPX4(model)) {
    for (const name of ARDU_COMMANDS) {
      if (!(name in CommonMavCmd)) list.push({ name, ardu: true });
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

const PARAM_HINTS: Record<string, string[]> = {
  COMPONENT_ARM_DISARM: ['1 arm / 0 disarm', '21196 force'],
  NAV_TAKEOFF: ['pitch deg', '', '', 'yaw deg or NaN', 'lat or NaN', 'lon or NaN', 'alt m'],
  NAV_LAND: ['abort alt m', 'precision mode', '', 'yaw deg or NaN', 'lat or NaN', 'lon or NaN', 'ground alt m'],
  NAV_RETURN_TO_LAUNCH: [],
  NAV_LOITER_UNLIM: ['', '', 'radius m', 'yaw', 'lat', 'lon', 'alt m'],
  NAV_LOITER_TIME: ['time s', '', 'radius m', 'xtrack', 'lat', 'lon', 'alt m'],
  DO_SET_MODE: ['base mode flags', 'custom mode', 'custom submode'],
  DO_CHANGE_SPEED: ['type 0 air / 1 ground', 'speed m/s', 'throttle % or -1'],
  DO_SET_SERVO: ['servo channel', 'PWM us'],
  DO_REPEAT_SERVO: ['servo channel', 'PWM us', 'count', 'period s'],
  DO_SET_HOME: ['1 current / 0 given', '', '', 'yaw deg', 'lat', 'lon', 'alt m'],
  DO_GRIPPER: ['gripper id', '0 release / 1 grab'],
  DO_WINCH: ['winch id', 'action', 'length m', 'rate m/s'],
  DO_PARACHUTE: ['0 disable / 1 enable / 2 release'],
  DO_MOTOR_TEST: ['motor index', 'throttle type', 'throttle value', 'timeout s', 'motor count', 'test order'],
  DO_FENCE_ENABLE: ['0 disable / 1 enable / 2 floor only'],
  DO_DIGICAM_CONTROL: ['session', 'zoom pos', 'zoom step', 'focus lock', 'shoot 1', 'command id'],
  CONDITION_YAW: ['angle deg', 'rate deg/s', '-1 ccw / 1 cw', '0 absolute / 1 relative'],
  MISSION_START: ['first item', 'last item'],
  REQUEST_MESSAGE: ['message id', 'p2 per message'],
  SET_MESSAGE_INTERVAL: ['message id', 'interval us or -1']
};

export function paramHint(name: string): string {
  const hints = PARAM_HINTS[name];
  if (!hints) return 'param1 .. param7 (trailing params optional; NaN allowed)';
  if (!hints.length) return 'no parameters';
  return hints.map((h, i) => `p${i + 1}${h ? ` ${h}` : ''}`).join('  ·  ');
}

export interface ParsedConsoleInput {
  ok: boolean;
  error?: string;
  name?: string;
  params?: number[];
  ardu?: boolean;
}

export function parseConsoleInput(input: string, model: string = get(mavModelStore)): ParsedConsoleInput {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ok: false, error: 'Type a MAV_CMD name' };
  const name = tokens[0].toUpperCase().replace(/^MAV_CMD_/, '');
  const entry = commandCatalog(model).find((c) => c.name === name);
  if (!entry) return { ok: false, error: `Unknown command for ${model || 'this autopilot'}: ${name}` };
  const raw = tokens.slice(1);
  if (raw.length > 7) return { ok: false, error: 'A command carries at most 7 params' };
  const params: number[] = [];
  for (const t of raw) {
    const v = Number.parseFloat(t);
    if (Number.isNaN(v) && t.toLowerCase() !== 'nan') return { ok: false, error: `Not a number: ${t}` };
    params.push(v);
  }
  return { ok: true, name, params, ardu: entry.ardu };
}
