import { get } from 'svelte/store';
import {
  mavArmedStateStore,
  mavModeStore,
  mavStateStore,
  mavBatteryStore,
  mavSatelliteStore,
  onlineStore
} from '../stores/mavlinkStore';
import { missionCompleteStore } from '../stores/missionPlanStore';
import { audioCalloutsStore } from '../stores/customizationStore';
import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';

// Spoken telemetry callouts, modeled on Mission Planner's speech option and
// GPWS-style annunciation: short standardized phrases on state transitions,
// deduplicated, with critical events interrupting whatever is speaking. Uses the
// browser Web Speech API, so no dependency or network is involved.

const MIN_REPEAT_MS = 1500;
const GPS_MIN_SATS = 6;
const BATTERY_LOW_PERCENT = 20;
const BATTERY_CRITICAL_PERCENT = 10;
const CALLOUT_RATE = 1.05;

let lastPhrase = '';
let lastSpokenAt = 0;

export function callout(phrase: string, critical = false): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!get(audioCalloutsStore)) return;

  const now = Date.now();
  if (phrase === lastPhrase && now - lastSpokenAt < MIN_REPEAT_MS) return;
  lastPhrase = phrase;
  lastSpokenAt = now;

  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.rate = CALLOUT_RATE;
  utterance.lang = getLocale();
  if (critical) window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function stopCallouts(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

const MODE_PHRASES: Record<string, () => string> = {
  RTL: m.callout_mode_rtl,
  'AUTO.RTL': m.callout_mode_rtl,
  SMART_RTL: m.callout_mode_smart_rtl,
  AUTO: m.callout_mode_auto,
  'AUTO.MISSION': m.callout_mode_auto,
  'AUTO.TAKEOFF': m.callout_mode_takeoff,
  GUIDED: m.callout_mode_guided,
  LOITER: m.callout_mode_loiter,
  'AUTO.LOITER': m.callout_mode_loiter,
  LAND: m.callout_mode_land,
  'AUTO.LAND': m.callout_mode_land,
  STABILIZE: m.callout_mode_stabilize,
  ALT_HOLD: m.callout_mode_alt_hold,
  POSHOLD: m.callout_mode_poshold,
  BRAKE: m.callout_mode_brake
};

function modePhrase(mode: string): string {
  const phrase = MODE_PHRASES[mode];
  return phrase ? phrase() : m.callout_mode_generic({ mode: mode.replace(/_/g, ' ').toLowerCase() });
}

// Subscribes to the telemetry stores and speaks a callout on each meaningful
// transition. Returns an unsubscribe function for the caller to run on teardown.
export function initCallouts(): () => void {
  let armedInit = false;
  let modeInit = false;
  let stateInit = false;
  let onlineInit = false;
  let missionInit = false;
  let gpsInit = false;
  let gpsOk = true;
  let prevComplete = true;
  let batteryFloor = 100;

  const unsubscribers = [
    mavArmedStateStore.subscribe((armed) => {
      if (!armedInit) return void (armedInit = true);
      callout(armed ? m.callout_armed() : m.callout_disarmed());
    }),

    mavModeStore.subscribe((mode) => {
      if (!modeInit) return void (modeInit = true);
      if (mode && mode !== 'Unknown') callout(modePhrase(mode));
    }),

    missionCompleteStore.subscribe((done) => {
      if (!missionInit) {
        missionInit = true;
        prevComplete = done;
        return;
      }
      if (done && !prevComplete) callout(m.callout_mission_complete());
      prevComplete = done;
    }),

    mavStateStore.subscribe((state) => {
      if (!stateInit) return void (stateInit = true);
      if (state === 'Critical') callout(m.callout_failsafe(), true);
      else if (state === 'Emergency') callout(m.callout_emergency(), true);
    }),

    mavBatteryStore.subscribe((percent) => {
      if (percent === null) return;
      if (percent <= BATTERY_CRITICAL_PERCENT && batteryFloor > BATTERY_CRITICAL_PERCENT) {
        callout(m.callout_battery_critical(), true);
        batteryFloor = BATTERY_CRITICAL_PERCENT;
      } else if (percent <= BATTERY_LOW_PERCENT && batteryFloor > BATTERY_LOW_PERCENT) {
        callout(m.callout_battery_low());
        batteryFloor = BATTERY_LOW_PERCENT;
      } else if (percent > BATTERY_LOW_PERCENT + 5) {
        batteryFloor = 100;
      }
    }),

    mavSatelliteStore.subscribe((sat) => {
      const ok = sat.total >= GPS_MIN_SATS;
      if (!gpsInit) {
        gpsInit = true;
        gpsOk = ok;
        return;
      }
      if (ok === gpsOk) return;
      gpsOk = ok;
      callout(ok ? m.callout_gps_acquired() : m.callout_gps_lost(), !ok);
    }),

    onlineStore.subscribe((online) => {
      if (!onlineInit) return void (onlineInit = true);
      callout(online ? m.callout_link_restored() : m.callout_link_lost());
    })
  ];

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
