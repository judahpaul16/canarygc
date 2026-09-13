import { get } from 'svelte/store';
import {
  mavModeStore,
  mavAltitudeStore,
  mavHeadingStore,
  fcProtocolStore,
  fcFirmwareStore
} from '../stores/mavlinkStore';
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
import { MSP } from './msp';

const SPEED_TYPE_AIRSPEED = 0;
const SPEED_TYPE_GROUNDSPEED = 1;
const THROTTLE_NO_CHANGE = -1;
const SPEED_ABSOLUTE = 0;
const SUB_DEPTH_HOLD_MODE = 2; // ArduSub ALT_HOLD (depth hold)
const YAW_RATE_DEG_PER_S = 10;
const YAW_RELATIVE_OFFSET = 1;
const HEADING_TYPE_COURSE_OVER_GROUND = 0;
const PLANE_HEADING_ACCEL_MSS = 2;
const PLANE_TURN_DISTANCE_M = 300;

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

// INAV takes a heading-hold target over MSP; Betaflight has no heading
// target, so the buttons hide on a Betaflight board.
async function setMspHeading(headingDeg: number): Promise<void> {
  const target = Math.round(headingDeg) % 360;
  await fetch('/api/msp/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: MSP.SET_HEAD, payload: [target & 0xff, (target >> 8) & 0xff] })
  });
}

// A rotorcraft yaws in place: PX4 rides DO_REPOSITION for yaw (CONDITION_YAW
// comes back UNSUPPORTED there) and ArduPilot yaws through its GUIDED
// mechanism. A plane turns instead: ArduPlane takes GUIDED_CHANGE_HEADING and
// PX4 fixed-wing moves its hold point onto the new course. INAV takes a
// heading-hold target over MSP.
export async function yawStep(direction: 1 | -1): Promise<void> {
  const target = (get(mavHeadingStore) + direction * YAW_STEP_DEG + 360) % 360;
  if (get(fcProtocolStore) === 'msp') {
    if (get(fcFirmwareStore) === 'INAV') await setMspHeading(target);
    return;
  }
  if (isPX4()) {
    if (isPlane()) {
      const rad = (target * Math.PI) / 180;
      await repositionRelative(
        PLANE_TURN_DISTANCE_M * Math.cos(rad),
        PLANE_TURN_DISTANCE_M * Math.sin(rad),
        0
      );
    } else {
      await repositionRelative(0, 0, 0, target);
    }
    return;
  }
  await ensureGuided();
  if (isPlane()) {
    await sendMavlinkCommand(
      'GUIDED_CHANGE_HEADING',
      [HEADING_TYPE_COURSE_OVER_GROUND, target, PLANE_HEADING_ACCEL_MSS, 0],
      { ardupilotMega: true }
    );
    return;
  }
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
