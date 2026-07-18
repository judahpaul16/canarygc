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
import { m } from '$lib/paraglide/messages';

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
    title: m.tl_confirm_takeoff_title(),
    content: m.tl_confirm_takeoff_body(),
    confirmation: true,
    inputs: [
      {
        type: 'number',
        placeholder: m.tl_altitude_placeholder(),
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
      title: m.tl_confirm_landing_title(),
      content: hasSequence
        ? m.tl_landing_sequence()
        : m.tl_landing_autoland(),
      confirmation: true,
      inputs: hasSequence
        ? null
        : [
            {
              type: 'checkbox',
              placeholder: m.tl_autoland_checkbox(),
              value: 'true',
              required: false
            }
          ],
      onConfirm: async (values) => {
        const landing = await landNow(hasSequence || values[0] === 'true');
        notify({
          title: landing ? m.tl_landing() : m.tl_returning(),
          content: landing
            ? m.tl_landing_body()
            : m.tl_returning_body(),
          type: landing ? 'success' : 'warning'
        });
      }
    });
    return;
  }
  showModal({
    title: m.tl_confirm_landing_title(),
    content: m.tl_confirm_land_mav(),
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
