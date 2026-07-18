import { get } from 'svelte/store';
import { mavlinkParamStore, mavModelStore, mavTypeStore, type Parameter } from '../stores/mavlinkStore';
import { isPX4, isPlane } from './flight-modes';
import { writeParameter } from './mavlink-client';
import { planeHasLandingSequence } from './landing';
import type { RtlParamWrite } from './rtl-altitude';
import { m } from '$lib/paraglide/messages';

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
      label: m.al_px4_label(),
      note: hasLandingSequence
        ? m.al_px4_note_seq()
        : m.al_px4_note_noseq(),
      current: param ? param.param_value : null,
      choices: [
        { value: 0, label: m.al_px4_choice_0() },
        { value: 1, label: m.al_px4_choice_1() },
        { value: 2, label: m.al_px4_choice_2() },
        { value: 3, label: m.al_px4_choice_3() }
      ],
      writes: (value) => (param ? [{ id: 'RTL_TYPE', value, type: param.param_type }] : [])
    };
  }

  const param = params.RTL_AUTOLAND;
  return {
    ask: true,
    label: m.al_ap_label(),
    note: hasLandingSequence
      ? m.al_ap_note_seq()
      : m.al_ap_note_noseq(),
    current: param ? param.param_value : null,
    choices: [
      { value: 0, label: m.al_ap_choice_0() },
      { value: 1, label: m.al_ap_choice_1() },
      { value: 2, label: m.al_ap_choice_2() },
      { value: 3, label: m.al_ap_choice_3() }
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
