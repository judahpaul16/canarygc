import { get } from 'svelte/store';
import {
  mavArmedStateStore,
  mavModeStore,
  mavStateStore,
  mavBatteryStore,
  mavSatelliteStore,
  onlineStore,
  mavLocationStore,
  mavAltitudeStore,
  mavSpeedStore,
  mavHeadingStore,
  mavModelStore,
  mavTypeStore
} from '../stores/mavlinkStore';
import { missionCompleteStore } from '../stores/missionPlanStore';
import type { AlertTelemetry } from './alert-types';

// Watches the same telemetry transitions as the spoken callouts and emails the
// operator when the matching alert type is enabled. Detection runs in the
// browser; the server holds the enabled set and SMTP config and does the send.

const GPS_MIN_SATS = 6;
const BATTERY_LOW_PERCENT = 20;
const BATTERY_CRITICAL_PERCENT = 10;
const MIN_REPEAT_MS = 60_000;

let enabled = new Set<string>();
const lastSentAt: Record<string, number> = {};

export async function refreshAlertConfig(): Promise<void> {
  try {
    const res = await fetch('/api/alerts/settings');
    if (!res.ok) return;
    const data = await res.json();
    enabled = new Set<string>(data.enabled ?? []);
  } catch {
    /* keep the cached set */
  }
}

function telemetrySnapshot(): AlertTelemetry {
  const loc = get(mavLocationStore) as { lat: number; lng: number };
  const sat = get(mavSatelliteStore);
  return {
    lat: loc.lat,
    lon: loc.lng,
    altitude: get(mavAltitudeStore),
    speed: get(mavSpeedStore),
    heading: get(mavHeadingStore),
    battery: get(mavBatteryStore),
    mode: get(mavModeStore),
    armed: get(mavArmedStateStore),
    state: get(mavStateStore),
    satellites: sat.total,
    hdop: sat.hdop,
    model: get(mavModelStore),
    type: get(mavTypeStore),
    online: get(onlineStore)
  };
}

async function dispatch(type: string, params: Record<string, string | number> = {}): Promise<void> {
  if (!enabled.has(type)) return;
  const now = Date.now();
  if (lastSentAt[type] && now - lastSentAt[type] < MIN_REPEAT_MS) return;
  lastSentAt[type] = now;
  try {
    await fetch('/api/alerts/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, params, telemetry: telemetrySnapshot() })
    });
  } catch {
    /* best-effort */
  }
}

export function initAlerts(): () => void {
  refreshAlertConfig();

  let armedInit = false;
  let modeInit = false;
  let stateInit = false;
  let onlineInit = false;
  let missionInit = false;
  let gpsInit = false;
  let gpsOk = true;
  let prevComplete = true;
  let batteryFloor = 100;
  // Crash heuristic: the craft climbed above a few meters while armed, then
  // disarmed while still showing altitude, which an intact landing never does.
  let wasAirborne = false;
  const CRASH_MIN_ALT_M = 3;

  const subs = [
    mavAltitudeStore.subscribe((alt) => {
      if (get(mavArmedStateStore) && alt > CRASH_MIN_ALT_M) wasAirborne = true;
    }),

    mavArmedStateStore.subscribe((armed) => {
      if (!armedInit) return void (armedInit = true);
      if (!armed && wasAirborne && get(mavAltitudeStore) > CRASH_MIN_ALT_M) {
        dispatch('crash', { alt: get(mavAltitudeStore).toFixed(0) });
      }
      if (!armed) wasAirborne = false;
      dispatch(armed ? 'armed' : 'disarmed');
    }),

    mavModeStore.subscribe((mode) => {
      if (!modeInit) return void (modeInit = true);
      if (mode && mode !== 'Unknown') dispatch('mode', { mode });
    }),

    missionCompleteStore.subscribe((done) => {
      if (!missionInit) {
        missionInit = true;
        prevComplete = done;
        return;
      }
      if (done && !prevComplete) dispatch('mission_complete');
      prevComplete = done;
    }),

    mavStateStore.subscribe((state) => {
      if (!stateInit) return void (stateInit = true);
      if (state === 'Critical') dispatch('failsafe');
      else if (state === 'Emergency') dispatch('emergency');
    }),

    mavBatteryStore.subscribe((percent) => {
      if (percent === null) return;
      if (percent <= BATTERY_CRITICAL_PERCENT && batteryFloor > BATTERY_CRITICAL_PERCENT) {
        dispatch('battery_critical', { percent });
        batteryFloor = BATTERY_CRITICAL_PERCENT;
      } else if (percent <= BATTERY_LOW_PERCENT && batteryFloor > BATTERY_LOW_PERCENT) {
        dispatch('battery_low', { percent });
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
      dispatch(ok ? 'gps_acquired' : 'gps_lost', { sats: sat.total });
    }),

    onlineStore.subscribe((online) => {
      if (!onlineInit) return void (onlineInit = true);
      dispatch(online ? 'link_restored' : 'link_lost');
    })
  ];

  return () => subs.forEach((unsubscribe) => unsubscribe());
}
