import { get } from 'svelte/store';
import { fcProtocolStore, fcFirmwareStore } from '../stores/mavlinkStore';
import { showModal, notify } from './overlays';
import { takeoff } from './mavlink-client';
import { isPlane } from './flight-modes';
import { landNow, planeHasLandingSequence } from './landing';
import {
  takeoffInavWithConfirm,
  startGuidanceWithConfirm,
  stopInavMission,
  stopGuidance
} from './guidance-session';

// Each firmware flies its own way: a MAVLink autopilot takes off and lands
// through its own commands, INAV runs its onboard takeoff and mission over MSP,
// and Betaflight (no waypoint engine) flies by companion guidance from the
// station, so its "take off" and "land" map onto starting and stopping that.
function fcIsMsp(): boolean {
  return get(fcProtocolStore) === 'msp';
}
function fcIsInav(): boolean {
  return get(fcProtocolStore) === 'msp' && get(fcFirmwareStore) === 'INAV';
}

function initTakeoff(): void {
  showModal({
    title: 'Confirm Takeoff',
    content: 'Are you sure you want to initiate takeoff? If so please specify the altitude.',
    confirmation: true,
    inputs: [
      {
        type: 'number',
        placeholder: 'Altitude (m)',
        required: true
      }
    ],
    onConfirm: async (values) => {
      await takeoff(parseInt(values[0]));
    }
  });
}

function initLanding(): void {
  if (isPlane()) {
    const hasSequence = planeHasLandingSequence();
    showModal({
      title: 'Confirm Landing',
      content: hasSequence
        ? 'The mission jumps to its landing sequence and the plane flies the approach down to touchdown.'
        : 'The loaded mission has no Land action. With the box checked, a landing approach into the launch point uploads on the spot, placed clear of obstacles, terrain, and restricted airspace where map data allows, and the plane flies it down to touchdown; unchecked, the plane returns to launch and loiters overhead until you land it.',
      confirmation: true,
      inputs: hasSequence
        ? null
        : [
            {
              type: 'checkbox',
              placeholder: 'Autoland at the launch point',
              value: 'true',
              required: false
            }
          ],
      onConfirm: async (values) => {
        const landing = await landNow(hasSequence || values[0] === 'true');
        notify({
          title: landing ? 'Landing' : 'Returning to launch',
          content: landing
            ? 'The plane is flying the landing approach down to touchdown.'
            : 'The plane loiters over the launch point until you land it.',
          type: landing ? 'success' : 'warning'
        });
      }
    });
    return;
  }
  showModal({
    title: 'Confirm Landing',
    content: 'Are you sure you want to land the MAV?',
    confirmation: true,
    onConfirm: async () => {
      await landNow();
    }
  });
}

export function takeoffWithConfirm(): void {
  if (fcIsInav()) takeoffInavWithConfirm();
  else if (fcIsMsp()) startGuidanceWithConfirm();
  else initTakeoff();
}

export function landWithConfirm(): void {
  if (fcIsInav()) stopInavMission();
  else if (fcIsMsp()) stopGuidance();
  else initLanding();
}
