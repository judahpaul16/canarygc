import { get } from 'svelte/store';
import { mavModeStore, mavAltitudeStore, mavHeadingStore } from '../stores/mavlinkStore';
import {
  sendMavlinkCommand,
  setFlightMode,
  setPositionLocal,
  setDepthGlobal,
  setAltitudeGlobal,
  repositionRelative
} from './mavlink-client';
import {
  isGuidedLabel,
  isSubmarine,
  isPlane,
  isPX4,
  MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
} from './flight-modes';

const SPEED_TYPE_AIRSPEED = 0;
const SPEED_TYPE_GROUNDSPEED = 1;
const THROTTLE_NO_CHANGE = -1;
const SPEED_ABSOLUTE = 0;
const SUB_DEPTH_HOLD_MODE = 2; // ArduSub ALT_HOLD (depth hold)
const YAW_RATE_DEG_PER_S = 10;
const YAW_RELATIVE_OFFSET = 1;

export const ALTITUDE_STEP_M = 10;
export const YAW_STEP_DEG = 10;

async function ensureGuided() {
  if (!isGuidedLabel(get(mavModeStore))) await setFlightMode('GUIDED');
}

// ArduSub holds depth in ALT_HOLD (depth hold), which needs only a depth
// sensor and so works on a sub with no horizontal position source. Depth
// setpoints are ignored in modes that do not hold depth.
async function ensureDepthHold() {
  if (get(mavModeStore) !== 'ALT_HOLD')
    await sendMavlinkCommand('DO_SET_MODE', [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, SUB_DEPTH_HOLD_MODE, 0], {
      cmdLong: true
    });
}

// ArduPlane holds airspeed; copter, rover, and boat use groundspeed.
export async function applyMaxSpeed(speedMs: number): Promise<void> {
  if (isNaN(speedMs)) return;
  await sendMavlinkCommand('DO_CHANGE_SPEED', [
    isPlane() ? SPEED_TYPE_AIRSPEED : SPEED_TYPE_GROUNDSPEED,
    speedMs,
    THROTTLE_NO_CHANGE,
    SPEED_ABSOLUTE
  ]);
}

// Commands the vertical target the connected vehicle understands: depth for a
// submarine, a global altitude hold for a plane, a relative reposition for
// PX4, and a local setpoint for an ArduPilot copter.
export async function goToVertical(valueM: number): Promise<void> {
  if (isNaN(valueM)) return;
  if (isSubmarine()) {
    await ensureDepthHold();
    await setDepthGlobal(valueM);
  } else if (isPlane()) {
    await ensureGuided();
    await setAltitudeGlobal(valueM);
  } else if (isPX4()) {
    await repositionRelative(0, 0, valueM - get(mavAltitudeStore));
  } else {
    await ensureGuided();
    await setPositionLocal(0, 0, -valueM);
  }
}

// PX4 rides DO_REPOSITION for yaw (CONDITION_YAW comes back UNSUPPORTED
// there); ArduPilot yaws in place through its GUIDED mechanism.
export async function yawStep(direction: 1 | -1): Promise<void> {
  if (isPX4()) {
    const yaw = (get(mavHeadingStore) + direction * YAW_STEP_DEG + 360) % 360;
    await repositionRelative(0, 0, 0, yaw);
    return;
  }
  await ensureGuided();
  await sendMavlinkCommand('CONDITION_YAW', [YAW_STEP_DEG, YAW_RATE_DEG_PER_S, direction, YAW_RELATIVE_OFFSET]);
}

// The up arrow climbs (air) or ascends toward the surface (sub); the down
// arrow descends. A submarine's depth is a positive number of meters below
// the surface, floored at 0 so ascending never commands a target above it.
export async function verticalStep(up: boolean, stepM: number = ALTITUDE_STEP_M): Promise<void> {
  const altitude = get(mavAltitudeStore);
  if (isSubmarine()) {
    await ensureDepthHold();
    const currentDepth = Math.max(0, -altitude);
    const target = up ? Math.max(0, currentDepth - stepM) : currentDepth + stepM;
    await setDepthGlobal(target);
  } else if (isPX4()) {
    await repositionRelative(0, 0, up ? stepM : -stepM);
  } else {
    await ensureGuided();
    const target = altitude + (up ? stepM : -stepM);
    if (isPlane()) await setAltitudeGlobal(target);
    else await setPositionLocal(0, 0, -target);
  }
}
