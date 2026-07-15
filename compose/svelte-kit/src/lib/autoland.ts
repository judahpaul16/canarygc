import { get } from 'svelte/store';
import { mavlinkParamStore, mavModelStore, mavTypeStore, type Parameter } from '../stores/mavlinkStore';
import { isPX4, isPlane } from './flight-modes';
import { writeParameter } from './mavlink-client';
import { planeHasLandingSequence } from './landing';
import type { RtlParamWrite } from './rtl-altitude';

export interface AutolandPlan {
  // Only a fixed wing is asked: it cannot hover, so whether a return to
  // launch ends in a landing or a loiter is a per-flight decision.
  ask: boolean;
  label: string;
  note: string;
  current: number | null;
  choices: { value: number; label: string }[];
  writes: (value: number) => RtlParamWrite[];
}

const NO_ASK: AutolandPlan = { ask: false, label: '', note: '', current: null, choices: [], writes: () => [] };

// ArduPlane lands automatically only through a landing sequence in the
// mission, entered per RTL_AUTOLAND; PX4 lands a plane only through a mission
// landing pattern, chosen as a return destination per RTL_TYPE. Copters,
// rovers, boats, and submarines land or hold on their own after a return.
export function autolandPlan(
  model: string,
  type: string,
  params: Record<string, Parameter | undefined>,
  hasLandingSequence: boolean
): AutolandPlan {
  if (!isPlane(type)) return NO_ASK;

  if (isPX4(model)) {
    const param = params.RTL_TYPE;
    return {
      ask: true,
      label: 'Return behavior (RTL_TYPE)',
      note: hasLandingSequence
        ? 'This mission carries a landing pattern. RTL_TYPE (also editable from the Parameters page) decides whether a return flies it or heads home to loiter.'
        : 'This mission has no Land action: the plane lands automatically only through a landing pattern in the mission, so a return loiters at the return point until you land it. Add a Land action to the end of the mission for an automatic landing.',
      current: param ? param.param_value : null,
      choices: [
        { value: 0, label: 'Return home directly' },
        { value: 1, label: 'Nearest rally point or mission landing' },
        { value: 2, label: 'Follow the mission path to its landing' },
        { value: 3, label: 'Closest safe destination' }
      ],
      writes: (value) => (param ? [{ id: 'RTL_TYPE', value, type: param.param_type }] : [])
    };
  }

  const param = params.RTL_AUTOLAND;
  return {
    ask: true,
    label: 'Autoland on return (RTL_AUTOLAND)',
    note: hasLandingSequence
      ? 'This mission carries a landing sequence. RTL_AUTOLAND (also editable from the Parameters page) decides whether a return to launch flies it or loiters at the return point.'
      : 'This mission has no Land action: a return to launch loiters overhead until you land the plane, and RTL_AUTOLAND acts only on a landing sequence in the mission. Add a Land action to the end of the mission for an automatic landing.',
    current: param ? param.param_value : null,
    choices: [
      { value: 0, label: 'Off: return and loiter' },
      { value: 1, label: 'Return home, then fly the landing sequence' },
      { value: 2, label: 'Go straight to the landing sequence' },
      { value: 3, label: 'Landing sequence only for go-arounds' }
    ],
    writes: (value) => (param ? [{ id: 'RTL_AUTOLAND', value, type: param.param_type }] : [])
  };
}

export function autolandNow(): AutolandPlan {
  return autolandPlan(get(mavModelStore), get(mavTypeStore), get(mavlinkParamStore), planeHasLandingSequence());
}

// Writes the connected vehicle's return-landing behavior. Resolves false when
// the vehicle has not published the parameter yet, so callers can say the
// value was not applied instead of dropping it silently.
export async function applyAutoland(value: number): Promise<boolean> {
  const writes = autolandNow().writes(value);
  if (writes.length === 0) return false;
  for (const write of writes) {
    await writeParameter(write.id, write.value, write.type);
  }
  return true;
}
