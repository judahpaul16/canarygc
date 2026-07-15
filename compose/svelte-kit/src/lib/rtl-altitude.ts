import { get } from 'svelte/store';
import { mavlinkParamStore, mavModelStore, mavTypeStore, type Parameter } from '../stores/mavlinkStore';
import { isPX4, isPlane, isGroundOrSurface, isSubmarine } from './flight-modes';
import { writeParameter } from './mavlink-client';

const CM_PER_M = 100;

export interface RtlParamWrite {
  id: string;
  value: number;
  type: number;
}

export interface RtlAltitudePlan {
  // Air vehicles are asked for a return altitude; rovers, boats, and
  // submarines have no return altitude to set.
  ask: boolean;
  // The vehicle's current return altitude in meters, when it reports one.
  currentM: number | null;
  writes: (meters: number) => RtlParamWrite[];
}

// Each autopilot names and scales its return altitude differently: ArduCopter
// climbs to RTL_ALT (centimeters, with RTL_CLIMB_MIN floored at zero so the
// entered value governs), ArduPlane holds ALT_HOLD_RTL (centimeters, -1 keeps
// the current altitude), and PX4 returns at RTL_RETURN_ALT (meters).
export function rtlAltitudePlan(
  model: string,
  type: string,
  params: Record<string, Parameter | undefined>
): RtlAltitudePlan {
  if (isGroundOrSurface(type) || isSubmarine(type)) {
    return { ask: false, currentM: null, writes: () => [] };
  }

  if (isPX4(model)) {
    const param = params.RTL_RETURN_ALT;
    return {
      ask: true,
      currentM: param ? param.param_value : null,
      writes: (meters) => (param ? [{ id: 'RTL_RETURN_ALT', value: meters, type: param.param_type }] : [])
    };
  }

  if (isPlane(type)) {
    const param = params.ALT_HOLD_RTL;
    return {
      ask: true,
      currentM: param && param.param_value > 0 ? param.param_value / CM_PER_M : null,
      writes: (meters) => (param ? [{ id: 'ALT_HOLD_RTL', value: meters * CM_PER_M, type: param.param_type }] : [])
    };
  }

  const param = params.RTL_ALT;
  const climb = params.RTL_CLIMB_MIN;
  return {
    ask: true,
    currentM: param ? param.param_value / CM_PER_M : null,
    writes: (meters) =>
      param
        ? [
            { id: 'RTL_ALT', value: meters * CM_PER_M, type: param.param_type },
            ...(climb ? [{ id: 'RTL_CLIMB_MIN', value: 0, type: climb.param_type }] : [])
          ]
        : []
  };
}

export function rtlAltitudeNow(): RtlAltitudePlan {
  return rtlAltitudePlan(get(mavModelStore), get(mavTypeStore), get(mavlinkParamStore));
}

// Writes the connected vehicle's return altitude. Resolves false when the
// vehicle has not published the parameter yet, so callers can say the value
// was not applied instead of dropping it silently.
export async function applyRtlAltitude(meters: number): Promise<boolean> {
  const writes = rtlAltitudeNow().writes(meters);
  if (writes.length === 0) return false;
  for (const write of writes) {
    await writeParameter(write.id, write.value, write.type);
  }
  return true;
}
