import { derived } from 'svelte/store';
import {
  mavLocationStore,
  mavHeadingStore,
  mavAttitudeStore,
  mavSpeedStore,
  mavAltitudeStore,
  mavAltitudeAmslStore
} from '../stores/mavlinkStore';
import { smoothLatLng, smoothAngle, smoothNumber } from './smoothing';

// Interpolated views of the live telemetry. The marker, HUD, and compass read
// these so roughly-once-a-second fixes render as continuous motion, the way a
// map app glides between sparse GPS points, at no extra link cost.
export const smoothLocationStore = smoothLatLng(mavLocationStore);
export const smoothHeadingStore = smoothAngle(mavHeadingStore);
export const smoothSpeedStore = smoothNumber(mavSpeedStore, 0.3, 15);
export const smoothAltitudeStore = smoothNumber(mavAltitudeStore, 0.3, 25);
export const smoothAmslStore = smoothNumber(mavAltitudeAmslStore, 0.3, 25);
export const smoothRollStore = smoothNumber(
  derived(mavAttitudeStore, (a) => a.rollDeg),
  0.18,
  45
);
export const smoothPitchStore = smoothNumber(
  derived(mavAttitudeStore, (a) => a.pitchDeg),
  0.18,
  45
);
