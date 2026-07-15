import { get } from 'svelte/store';
import {
  missionPlanActionsStore,
  missionIndexStore,
  missionCompleteStore
} from '../stores/missionPlanStore';
import { mavStateStore } from '../stores/mavlinkStore';
import { showModal, notify, type ModalInput } from './overlays';
import { setFlightMode, takeoff } from './mavlink-client';
import { preflightCheck } from './preflight';
import { rtlAltitudeNow, applyRtlAltitude } from './rtl-altitude';
import { autolandNow, applyAutoland } from './autoland';

export const DEFAULT_TAKEOFF_ALT_M = 10;
const TAKEOFF_SETTLE_DELAY_MS = 5000;

// Confirms and starts (or resumes) the loaded mission on a MAVLink vehicle.
// Air vehicles are asked for the return altitude, which lands in the connected
// autopilot's own parameter (ArduCopter RTL_ALT, ArduPlane ALT_HOLD_RTL, PX4
// RTL_RETURN_ALT); a fixed wing is additionally shown how a return to launch
// ends (landing sequence or loiter) with its autoland parameter set right
// here. Ground and surface craft skip both.
export function startMissionWithConfirm(): void {
  const rtl = rtlAltitudeNow();
  const autoland = autolandNow();
  const content = [
    rtl.ask
      ? 'Are you sure you want to start the mission? Set the altitude in meters the vehicle uses when returning to launch, considering any obstacles between the mission area and the launch point.'
      : 'Are you sure you want to start the mission?',
    ...(autoland.ask ? [autoland.note] : [])
  ].join('\n\n');

  const inputs: ModalInput[] = [];
  if (rtl.ask) {
    inputs.push({
      type: 'number',
      label: 'Return altitude (m)',
      placeholder: `${rtl.currentM ?? DEFAULT_TAKEOFF_ALT_M}`,
      required: true
    });
  }
  const autolandIndex = inputs.length;
  if (autoland.ask) {
    inputs.push({
      type: 'select',
      label: autoland.label,
      placeholder: '',
      required: false,
      value: autoland.current === null ? '' : String(autoland.current),
      options: [
        ...(autoland.current === null ? [{ value: '', label: 'Keep current setting' }] : []),
        ...autoland.choices.map((choice) => ({ value: String(choice.value), label: choice.label }))
      ]
    });
  }

  showModal({
    title: 'Start / Resume Mission',
    content,
    confirmation: true,
    inputs: inputs.length > 0 ? inputs : null,
    onConfirm: async (values) => {
      if (!(await preflightCheck(get(missionPlanActionsStore)))) return;
      missionIndexStore.set(1);
      missionCompleteStore.set(false);
      if (rtl.ask && !(await applyRtlAltitude(parseInt(values[0])))) {
        notify({
          title: 'Return altitude not set',
          content:
            'The vehicle has not published its return-altitude parameter yet, so it returns at its current setting.',
          type: 'warning'
        });
      }
      if (autoland.ask) {
        const picked = values[autolandIndex];
        if (picked !== '' && Number(picked) !== autoland.current && !(await applyAutoland(Number(picked)))) {
          notify({
            title: 'Return behavior not set',
            content:
              'The vehicle has not published its return parameter yet, so it returns at its current setting.',
            type: 'warning'
          });
        }
      }
      if (get(mavStateStore) === 'STANDBY') {
        await takeoff(DEFAULT_TAKEOFF_ALT_M);
        await new Promise((resolve) => setTimeout(resolve, TAKEOFF_SETTLE_DELAY_MS));
      }
      await setFlightMode('AUTO');
      notify({
        title: 'Mission Started',
        content: 'The mission has been started.'
      });
    }
  });
}
