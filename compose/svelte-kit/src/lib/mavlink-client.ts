import { get } from 'svelte/store';
import { mavModelStore, mavLocationStore, mavAltitudeAmslStore } from '../stores/mavlinkStore';
import { strategyFor, isPX4, type FlightMode } from './flight-modes';
import { notify } from './overlays';

export interface CommandOptions {
  cmdLong?: boolean;
  ardupilotMega?: boolean;
}

export async function sendMavlinkCommand(
  command: string,
  params: (number | string)[] = [],
  options: CommandOptions = {}
): Promise<boolean> {
  const response = await fetch('/api/mavlink/send_command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      command,
      params: `${params}`,
      useCmdLong: `${options.cmdLong ?? false}`,
      useArduPilotMega: `${options.ardupilotMega ?? false}`
    }
  });
  if (!response.ok) console.error(`Error: ${await response.text()}`);
  return response.ok;
}

// Gamepad flight: one MANUAL_CONTROL frame per tick of the client-side loop.
export async function sendManualControl(frame: {
  x: number;
  y: number;
  z: number;
  r: number;
  buttons: number;
}): Promise<boolean> {
  const response = await fetch('/api/mavlink/manual_control', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      x: `${frame.x}`,
      y: `${frame.y}`,
      z: `${frame.z}`,
      r: `${frame.r}`,
      buttons: `${frame.buttons}`
    }
  });
  return response.ok;
}

const DO_REPOSITION_CHANGE_MODE = 1;
const M_PER_DEG_LAT = 111320;

// PX4 flies click nudges through DO_REPOSITION in Hold, the same command QGC
// uses for go-to; it also takes a target heading, covering yaw where PX4
// rejects CONDITION_YAW. Offsets are meters in world frame, yaw in degrees
// (NaN keeps the current heading). PX4's navigator reads the altitude as AMSL
// and the yaw as radians, whatever the message declares.
export async function repositionRelative(
  dNorthM: number,
  dEastM: number,
  dAltM: number,
  yawDeg: number = NaN
): Promise<boolean> {
  const loc = get(mavLocationStore);
  if (!loc) return false;
  const lat = loc.lat + dNorthM / M_PER_DEG_LAT;
  const lng = loc.lng + dEastM / (M_PER_DEG_LAT * Math.cos((loc.lat * Math.PI) / 180));
  const yawRad = (yawDeg * Math.PI) / 180;
  return sendMavlinkCommand('DO_REPOSITION', [
    -1,
    DO_REPOSITION_CHANGE_MODE,
    0,
    Math.atan2(Math.sin(yawRad), Math.cos(yawRad)),
    Math.round(lat * 1e7),
    Math.round(lng * 1e7),
    get(mavAltitudeAmslStore) + dAltM
  ]);
}

// Sets the flight mode using the encoding of whichever autopilot is connected.
export async function setFlightMode(mode: FlightMode): Promise<boolean> {
  const [baseMode, customMode, customSubMode] = strategyFor().setModeParams(mode);
  return sendMavlinkCommand('DO_SET_MODE', [baseMode, customMode, customSubMode], { cmdLong: true });
}

export async function armDisarm(arm: boolean): Promise<boolean> {
  return sendMavlinkCommand('COMPONENT_ARM_DISARM', [arm ? 1 : 0, 0], { cmdLong: true });
}

// Single local-NED position setpoints only steer ArduPilot's GUIDED mode; PX4's
// OFFBOARD mode rejects them without a continuous setpoint stream.
export async function setPositionLocal(x: number | string, y: number | string, z: number | string): Promise<boolean> {
  if (isPX4(get(mavModelStore))) {
    notify({
      title: 'Not available on PX4',
      content: 'Manual position nudges require ArduPilot GUIDED mode. Use a mission or RC control for PX4 vehicles.',
      type: 'warning'
    });
    return false;
  }
  const response = await fetch('/api/mavlink/set_position_local', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      x: `${x}`,
      y: `${y}`,
      z: `${z}`
    }
  });
  if (!response.ok) console.error('Failed to set local position');
  return response.ok;
}

// MAV_PARAM_TYPE numeric ranges (https://mavlink.io/en/messages/common.html#MAV_PARAM_TYPE)
const PARAM_RANGES: Record<number, { min: number; max: number; integer: boolean }> = {
  1: { min: 0, max: 255, integer: true },
  2: { min: -128, max: 127, integer: true },
  3: { min: 0, max: 65535, integer: true },
  4: { min: -32768, max: 32767, integer: true },
  5: { min: 0, max: 4294967295, integer: true },
  6: { min: -2147483648, max: 2147483647, integer: true }
};

export function encodeParameterValue(value: number, paramType: number): number {
  const range = PARAM_RANGES[paramType];
  if (!range) return value;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  return range.integer ? Math.round(clamped) : clamped;
}

// PX4 publishes some params as NaN (shipped as null); those carry no value.
export function decodeParameterValue(encodedValue: string, paramType: string): number | null {
  const value = parseFloat(encodedValue);
  if (!Number.isFinite(value)) return null;
  return encodeParameterValue(value, parseInt(paramType));
}

export async function writeParameter(id: string, value: number, type: number): Promise<boolean> {
  const encodedValue = encodeParameterValue(value, type);
  const cleanId = id.replace(/^"|"$/g, '');
  const response = await fetch('/api/mavlink/write_param', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      id: cleanId,
      value: encodedValue.toString(),
      type: type.toString()
    }
  });
  if (!response.ok) console.error('Failed to write parameter:', await response.text());
  return response.ok;
}

export async function requestParameters(): Promise<boolean> {
  const response = await fetch('/api/mavlink/request_params', {
    method: 'POST',
    headers: { 'content-type': 'application/json' }
  });
  if (!response.ok) console.error('Failed to request parameters:', await response.text());
  return response.ok;
}
