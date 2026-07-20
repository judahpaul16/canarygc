<script lang="ts">
  import { MavType, MavState, MavAutopilot } from 'mavlink-mappings/dist/lib/minimal';
  import { MavCmd, MavResult } from 'mavlink-mappings/dist/lib/common';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { page } from '$app/stores';
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import '../app.css';
  import {
    onlineStore,
    mavHeadingStore,
    mavLocationStore,
    mavHomeStore,
    mavlinkLogStore,
    mavlinkParamStore,
    mavAltitudeStore,
    mavAltitudeAmslStore,
    mavSpeedStore,
    mavModelStore,
    mavTypeStore,
    mavStateStore,
    mavModeStore,
    fcProtocolStore,
    fcFirmwareStore,
    mavBatteryStore,
    mavArmedStateStore,
    mavSatelliteStore,
    mavAttitudeStore,
    mavVibrationStore,
    mavServoOutputStore,
    mavVideoStreamStore,
    type Parameter
  } from '../stores/mavlinkStore';
  import {
    missionPlanTitleStore,
    missionPlanActionsStore,
    missionCountStore,
    missionIndexStore,
    missionCompleteStore
  } from '../stores/missionPlanStore';
  import { darkModeStore, audioCalloutsStore } from '../stores/customizationStore';
  import { loggedInStore } from '../stores/authStore';
  import { get } from 'svelte/store';
  import Offline from '../components/Offline.svelte';
  import GuidancePanel from '../components/GuidancePanel.svelte';
  import Map from '../components/Map.svelte';
  import { locales, getLocale, setLocale, type Locale } from '$lib/paraglide/runtime';
  import { m } from '$lib/paraglide/messages';
  import { notify, type NotificationType } from '../lib/overlays';
  import { callout, initCallouts, stopCallouts } from '../lib/callouts';
  import { initAlerts } from '../lib/alerts';
  import {
    cleanTfrDescription,
    loadDismissedNotams,
    notamDetailLine,
    recordDismissedNotam,
    unseenNotams,
    type Notam
  } from '../lib/notams';
  import { recordFlightLine, flushFlightLog } from '../lib/flight-log';
  import { decodeMode, isArmed, isPX4 } from '../lib/flight-modes';
  import { normalizeMission } from '../lib/mission-commands';
  import { decodeParameterValue, requestParameters, sendMavlinkCommand } from '../lib/mavlink-client';
  import { parseCalStatustext, parseMagCalProgress, parseMagCalReport } from '../lib/calibration';
  import { calibrationStore } from '../stores/calibrationStore';
  import { trafficStore, trafficThreatsStore, upsertTraffic } from '../stores/trafficStore';
  import { detectThreats } from '../lib/collision';
  import { safetyLimitsStore, tfrOverlaysStore } from '../stores/safetyStore';
  import { mapFocusStore } from '../stores/mapStore';

  let { children } = $props();

  const HEARTBEAT_POLL_MS = 1100;
  const IDLE_LOGOUT_MS = 600_000;
  const IDLE_POLL_MS = 1000;
  const STARTUP_SYNC_DELAY_MS = 2000;
  const LOG_HISTORY_LIMIT = 1000;
  const BATTERY_ALERT_THRESHOLDS = [50, 20, 15, 10, 5];
  const BATTERY_CRITICAL_PERCENT = 20;

  let heightOfDashboard = $state(1000);
  let logs: string[] = [];
  let isNavOpen = $state(false);
  let batteryAlertIndex = 0;
  let batteryAlertShown = false;
  let resizeObserver: ResizeObserver | undefined;

  let loggedIn = $derived($loggedInStore);
  let battery = $derived($mavBatteryStore);
  let online = $derived($onlineStore);
  let darkMode = $derived($darkModeStore);
  const AUTH_PAGES = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password']);

  // The theme is a single class on <html>; every --primaryColor/--fontColor
  // resolves from :root or html.dark in app.css, so the whole app follows here.
  $effect(() => {
    document.documentElement.classList.toggle('dark', $darkModeStore);
  });

  let currentPath = $derived($page.url.pathname);
  let isNavHidden = $derived(AUTH_PAGES.has(currentPath));

  $effect(() => {
    missionCountStore.set(Object.keys($missionPlanActionsStore).length - 1);
  });

  $effect(() => {
    if (battery && battery <= BATTERY_ALERT_THRESHOLDS[batteryAlertIndex] && !batteryAlertShown) {
      showNotification({
        title: 'Low Battery Alert',
        content: `Battery level is at ${battery}%. It's highly recommended to return to home or land immediately to prevent a crash.`,
        type: battery <= BATTERY_CRITICAL_PERCENT ? 'error' : 'warning',
      });
      batteryAlertIndex++;
      batteryAlertShown = true;
    } else if (battery && battery > BATTERY_ALERT_THRESHOLDS[batteryAlertIndex]) {
      batteryAlertShown = false;
    }
  });

  function updateDashboardHeight() {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      heightOfDashboard = dashboard.clientHeight;
      if (window.location.pathname !== '/') {
        if (window.location.pathname !== '/dashboard') heightOfDashboard += 1;
        const nav = document.querySelector('.desktop-nav') as HTMLElement | null;
        if (nav) nav.style.opacity = '1';
        (dashboard as HTMLElement).style.opacity = '1';
      }
    }
  }

  // Re-run after navigation: each page renders its own .dashboard element and
  // the desktop nav is hidden on the public routes.
  $effect(() => {
    void currentPath;
    untrack(() => {
      resizeObserver?.disconnect();
      const dashboard = document.querySelector('.dashboard');
      if (dashboard) {
        resizeObserver = new ResizeObserver(updateDashboardHeight);
        resizeObserver.observe(dashboard);
      }
      updateDashboardHeight();
    });
  });

  // One missed poll (a dev-server reload, a momentary hiccup) must not flash
  // the offline modal; the link counts as down after several misses in a row.
  const OFFLINE_AFTER_MISSES = 3;
  let consecutiveMisses = 0;
  // An MSP-only dev profile (Betaflight or INAV SITL) carries no MAVLink vehicle,
  // so the heartbeat reports the link disabled and the offline modal stays hidden.
  let mavlinkDisabled = $state(false);
  // Cached MSP flight-controller identity so the dashboard shows the connected
  // Betaflight or INAV board rather than an empty MAVLink vehicle.
  let mspIdentity: { firmware: string; boardName: string; targetName: string; boardIdentifier: string } | null = null;
  let mspTelemetryInFlight = false;

  // The SSE telemetry stream pushes each MAVLink log line in real time; the
  // heartbeat poll only drains logs as a fallback while the stream is down.
  let telemetryStream: EventSource | null = null;
  let streamActive = false;

  function mspVoltageToPercent(v: number): number {
    if (v <= 0) return 0;
    const cells = Math.max(1, Math.ceil(v / 4.3));
    return Math.max(0, Math.min(100, Math.round(((v / cells - 3.3) / 0.9) * 100)));
  }

  // MSP has no log stream, so state transitions become event-log lines to keep
  // the events page populated on a Betaflight or INAV board.
  let prevMspArmed: boolean | null = null;
  let prevMspFix: boolean | null = null;
  function pushMspEvent(line: string): void {
    const now = new Date();
    const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    mavlinkLogStore.update((l) => [...l.slice(-500), `${line} at ${stamp}`]);
  }

  // Feeds MSP flight-controller telemetry into the same stores the MAVLink path
  // uses, so a Betaflight or INAV board drives the dashboard gauges.
  function applyMspTelemetry(t: {
    attitude?: { rollDeg: number; pitchDeg: number; yawDeg: number } | null;
    gps?: { fix: number; numSat: number; lat: number; lon: number; speedMs: number; hdop: number | null } | null;
    altitude?: { altM: number } | null;
    analog?: { voltageV: number } | null;
    status?: { armed: boolean } | null;
  }) {
    if (t.attitude) {
      mavAttitudeStore.set({ rollDeg: t.attitude.rollDeg, pitchDeg: t.attitude.pitchDeg });
      mavHeadingStore.set(t.attitude.yawDeg);
    }
    if (t.gps) {
      mavSatelliteStore.set({ total: t.gps.numSat, hdop: t.gps.hdop ?? 999 });
      const hasFix = t.gps.fix >= 2;
      if (prevMspFix !== null && hasFix !== prevMspFix) {
        pushMspEvent(hasFix ? `GPS FIX ACQUIRED (${t.gps.numSat} sats)` : 'GPS FIX LOST');
      }
      prevMspFix = hasFix;
      if (t.gps.fix > 0) {
        mavLocationStore.set({ lat: t.gps.lat, lng: t.gps.lon });
        mavSpeedStore.set(t.gps.speedMs);
      }
    }
    if (t.altitude) mavAltitudeStore.set(t.altitude.altM);
    // A bench or SITL board with no battery sensor reports 0 V; show that as no
    // reading ("--") rather than a misleading empty-battery 0%.
    if (t.analog) mavBatteryStore.set(t.analog.voltageV > 0 ? mspVoltageToPercent(t.analog.voltageV) : null);
    if (t.status) {
      if (prevMspArmed !== null && t.status.armed !== prevMspArmed) {
        pushMspEvent(t.status.armed ? 'ARMED' : 'DISARMED');
      }
      prevMspArmed = t.status.armed;
      mavArmedStateStore.set(t.status.armed);
      mavModeStore.set(t.status.armed ? 'Armed' : 'Disarmed');
      mavStateStore.set(t.status.armed ? 'ACTIVE' : 'STANDBY');
    }
  }

  function setOnline(value: boolean) {
    if (value) {
      consecutiveMisses = 0;
      if (!online) onlineStore.set(true);
      return;
    }
    consecutiveMisses += 1;
    if (consecutiveMisses >= OFFLINE_AFTER_MISSES && online) onlineStore.set(false);
  }

  function openTelemetryStream() {
    if (telemetryStream) return;
    const es = new EventSource('/api/mavlink/stream');
    telemetryStream = es;
    es.onopen = () => {
      streamActive = true;
    };
    es.onmessage = (ev) => {
      let msg: { log?: string; disabled?: boolean };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.disabled) {
        // MSP flight controller: no MAVLink stream, so the poll drives it.
        mavlinkDisabled = true;
        return;
      }
      if (typeof msg.log === 'string') {
        mavlinkDisabled = false;
        fcProtocolStore.set('mavlink');
        fcFirmwareStore.set(null);
        getLogs(msg.log.replace(/\\"/g, '"') + '\n');
        setOnline(true);
      }
    };
    es.onerror = () => {
      // The browser reconnects on its own; the poll covers the gap.
      streamActive = false;
      setOnline(false);
    };
  }

  function closeTelemetryStream() {
    telemetryStream?.close();
    telemetryStream = null;
    streamActive = false;
  }

  // Hold the stream open on every authenticated page and drop it on the login
  // routes, mirroring the heartbeat poll's guard.
  $effect(() => {
    const active = loggedIn && !isNavHidden;
    untrack(() => (active ? openTelemetryStream() : closeTelemetryStream()));
  });

  async function checkOnlineStatus() {
    if (isNavHidden) return;
    try {
      const response = await fetch('/api/mavlink/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.disabled) {
          mavlinkDisabled = true;
          // No MAVLink vehicle: identify the MSP flight controller so the
          // dashboard shows the connected Betaflight or INAV board.
          if (!mspIdentity) {
            try {
              const fc = await fetch('/api/msp/detect');
              if (fc.ok) {
                const id = await fc.json();
                if (id.firmware && id.firmware !== 'Unknown') {
                  mspIdentity = id;
                  mavModelStore.set(id.firmware);
                  // Name the airframe class (Multirotor, Airplane, Rover, Boat),
                  // with the board in parentheses, so the label reads like the
                  // MAVLink vehicle type rather than the bare target name.
                  {
                    const board = id.boardName || id.targetName || id.boardIdentifier;
                    mavTypeStore.set(id.platform ? (board ? `${id.platform} (${board})` : id.platform) : board || 'MSP');
                  }
                  fcFirmwareStore.set(id.firmware);
                  pushMspEvent(`CONNECTED ${id.firmware} ${id.boardName || id.targetName || 'flight controller'}`);
                }
              }
            } catch {
              // Retry on the next poll.
            }
          }
          onlineStore.set(Boolean(mspIdentity));
          if (!mspIdentity) {
            mavModelStore.set('N/A');
            return;
          }
          fcProtocolStore.set('msp');
          if (!mspTelemetryInFlight) {
            mspTelemetryInFlight = true;
            fetch('/api/msp/telemetry')
              .then((r) => (r.ok ? r.json() : null))
              .then((t) => { if (t) applyMspTelemetry(t); })
              .catch(() => {})
              .finally(() => { mspTelemetryInFlight = false; });
          }
          return;
        }
        mavlinkDisabled = false;
        fcProtocolStore.set('mavlink');
        fcFirmwareStore.set(null);
        // The SSE stream delivers each log line in real time; when it is up the
        // poll confirms the link but leaves log processing to the stream.
        if (streamActive) {
          setOnline(true);
          return;
        }
        if (data.length > 0) {
          data.forEach((log: string) => {
            getLogs(log.replace(/\\"/g, '"') + '\n');
          });
          setOnline(true);
        } else {
          setOnline(false);
        }
      } else if (response.status === 401) {
        // The server session is gone; return to login.
        handleLogout();
      } else {
        setOnline(false);
      }
    } catch {
      setOnline(false);
    }
  }

  async function checkLoadedMission() {
    try {
      const response = await fetch('/api/mission/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      let responseData = await response.json();
      if (responseData.length > 0) {
        const loadedMission = responseData.find((mission: { isLoaded: number }) => mission.isLoaded === 1);
        if (loadedMission) {
          const actions = JSON.parse(loadedMission.actions);
          missionPlanTitleStore.set(loadedMission.title);
          missionPlanActionsStore.set(actions);
          // Re-sync the vehicle once it has identified itself, so the plan is
          // resolved into wire-ready items for the connected autopilot. Sending
          // the raw stored plan re-uploads unset commands the vehicle rejects
          // on every page load.
          for (let i = 0; i < 20 && get(mavModelStore) === 'UNKNOWN'; i++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          if (get(mavModelStore) === 'UNKNOWN') return;
          const { items } = normalizeMission(actions, isPX4(get(mavModelStore)));
          try {
              let response = await fetch("/api/mavlink/load_mission", {
                  method: "POST",
                  headers: {
                      "content-type": "application/json",
                      "actions": JSON.stringify(items),
                  },
              });
              if (response.ok) {
                  console.log(await response.text());
              } else {
                  console.error(`Error: ${await response.text()}`);
              }
          } catch (error) {
              console.error("Error:", error);
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('The request was autocancelled')) {
        // ignore it
      } else {
        console.error('Error:', err.message || err);
        console.error('Stack Trace:', err.stack || 'No stack trace available');
      }
    }
  }

  type MessageHandler = (text: string) => void;

  interface Position {
    lat: number;
    lng: number;
  }

  interface SatelliteInfo {
    total: number;
    hdop: number;
  }

  interface NotificationConfig {
    title: string;
    content: string;
    type: NotificationType;
    duration?: number;
  }

  // Helper functions to extract and parse values from log text
  function extractValue(text: string, key: string): string {
    const match = text.match(new RegExp(`"${key}":"?([^,"]+)"?`));
    return match ? match[1].replace(/^"|"$/g, '') : '';
  }

  const parseLocation = (lat: string | null, lon: string | null): Position | null => {
    if (!lat || !lon) return null;
    return {
      lat: parseFloat(lat) / 1e7,
      lng: parseFloat(lon) / 1e7
    };
  };

  const calculateSpeed = (text: string): number | null => {
    const vx = parseInt(extractValue(text, 'vx') || '0') / 100;
    const vy = parseInt(extractValue(text, 'vy') || '0') / 100;
    const vz = parseInt(extractValue(text, 'vz') || '0') / 100;
    return Math.sqrt(Math.pow(vx, 2) + Math.pow(vy, 2) + Math.pow(vz, 2));
  };

  const showNotification = (config: NotificationConfig) => {
    notify(config);
  };

  const toProperCase = (str: string): string =>
    str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

  // Message handlers for different MAVLink message types
  const messageHandlers: Record<string, MessageHandler> = {
    GLOBAL_POSITION_INT: (text: string) => {
      const lat = extractValue(text, 'lat');
      const lon = extractValue(text, 'lon');
      const position = parseLocation(lat, lon);
      if (position) mavLocationStore.set(position);

      const heading = extractValue(text, 'hdg');
      if (heading) mavHeadingStore.set(parseFloat(heading) / 100);

      const altitude = extractValue(text, 'relativeAlt');
      if (altitude) mavAltitudeStore.set(parseFloat(altitude) / 1000);

      const altitudeAmsl = extractValue(text, 'alt');
      if (altitudeAmsl) mavAltitudeAmslStore.set(parseFloat(altitudeAmsl) / 1000);

      const speed = calculateSpeed(text);
      if (speed) mavSpeedStore.set(parseFloat(speed.toFixed(2)));
    },

    ATTITUDE: (text: string) => {
      const roll = extractValue(text, 'roll');
      const pitch = extractValue(text, 'pitch');
      if (!roll && !pitch) return;
      const toDeg = (rad: string) => (rad ? (parseFloat(rad) * 180) / Math.PI : 0);
      mavAttitudeStore.set({ rollDeg: toDeg(roll), pitchDeg: toDeg(pitch) });
    },

    HOME_POSITION: (text: string) => {
      const home = parseLocation(extractValue(text, 'latitude'), extractValue(text, 'longitude'));
      if (home) mavHomeStore.set({ lat: home.lat, lon: home.lng });
    },

    SERVO_OUTPUT_RAW: (text: string) => {
      const servos: number[] = [];
      for (let i = 1; i <= 8; i++) {
        const v = extractValue(text, `servo${i}Raw`);
        servos.push(v ? parseInt(v) : 0);
      }
      mavServoOutputStore.set(servos);
    },

    VIBRATION: (text: string) => {
      const x = extractValue(text, 'vibrationX');
      const y = extractValue(text, 'vibrationY');
      const z = extractValue(text, 'vibrationZ');
      if (!x && !y && !z) return;
      mavVibrationStore.set({
        x: parseFloat(x) || 0,
        y: parseFloat(y) || 0,
        z: parseFloat(z) || 0,
        clip0: parseInt(extractValue(text, 'clipping0')) || 0,
        clip1: parseInt(extractValue(text, 'clipping1')) || 0,
        clip2: parseInt(extractValue(text, 'clipping2')) || 0
      });
    },

    VIDEO_STREAM_INFORMATION: (text: string) => {
      const uri = extractValue(text, 'uri');
      if (!uri) return;
      mavVideoStreamStore.set({ uri, name: extractValue(text, 'name') });
    },

    GPS_RAW_INT: (text: string) => {
      const eph = extractValue(text, 'eph');
      const satellites = extractValue(text, 'satellitesVisible');
      if (eph && satellites) {
        const satInfo: SatelliteInfo = {
          total: parseInt(satellites),
          hdop: parseFloat(eph) * 1e-2
        };
        mavSatelliteStore.set(satInfo);
      }
    },

    HEARTBEAT: (text: string) => {
      const type = extractValue(text, 'type');
      if (type) mavTypeStore.set(toProperCase(MavType[parseInt(type)]));

      const model = extractValue(text, 'autopilot');
      if (model) mavModelStore.set(MavAutopilot[parseInt(model)]);

      const state = extractValue(text, 'systemStatus');
      if (state) mavStateStore.set(MavState[parseInt(state)]);

      const baseMode = extractValue(text, 'baseMode');
      if (baseMode) mavArmedStateStore.set(isArmed(parseInt(baseMode)));

      const customMode = extractValue(text, 'customMode');
      if (customMode) mavModeStore.set(decodeMode(parseInt(customMode)));
    },

    MISSION_CURRENT: (text: string) => {
      const index = extractValue(text, 'seq');
      if (index) missionIndexStore.set(parseInt(index));
    },

    MISSION_ITEM_REACHED: (text: string) => {
      const index = extractValue(text, 'seq');
      if (!index) return;

      const actions = get(missionPlanActionsStore);
      const indexNum = parseInt(index);
      if (indexNum === Object.keys(actions).length - 1) {
        missionCompleteStore.set(true);
      }

      const action = actions[indexNum];
      if (!action) return;
      showNotification({
        title: 'Waypoint Reached',
        content: `${index}: ${action.type}<br>lat: ${action.lat} °<br>lng: ${action.lon} °<br>alt: ${action.alt === null ? 0 : action.alt} m`,
        type: 'success'
      });
    },

    BATTERY_STATUS: (text: string) => {
      const battery = extractValue(text, 'batteryRemaining');
      if (battery) mavBatteryStore.set(parseInt(battery));
    },

    COMMAND_ACK: (text: string) => {
      const command = extractValue(text, 'command');
      const result = extractValue(text, 'result');

      if (!command || !result) return;

      const commandName = MavCmd[parseInt(command)];
      const resultName = MavResult[parseInt(result)];

      if (commandName === 'REQUEST_MESSAGE') return;

      let type: NotificationConfig['type'] = 'success';
      if (resultName !== 'ACCEPTED') {
        type = resultName.includes('FAILED') ||
              resultName.includes('DENIED') ||
              resultName.includes('UNSUPPORTED') ? 'error' : 'warning';
      }

      showNotification({
        title: 'Command Acknowledged',
        content: `Command: ${commandName}<br>Result: ${resultName}`,
        type
      });
    },

    STATUSTEXT: (text: string) => {
      const severity = extractValue(text, 'severity');
      const statusText = text.match(/"text":"(.+?)"/)?.[0]
        ?.replace('"text":"', '')
        ?.replace('"', '');

      if (!severity || !statusText) return;

      // Calibration narration ([cal] lines) drives the calibration page rather
      // than a toast, so a running routine updates its progress and log inline.
      const cal = parseCalStatustext(statusText);
      if (cal) {
        calibrationStore.update((s) => ({
          ...s,
          progress: cal.progress ?? s.progress,
          orientation: cal.orientation ?? s.orientation,
          status: cal.failed ? 'failed' : cal.done ? 'done' : s.status,
          log: [...s.log.slice(-40), cal.text]
        }));
        return;
      }

      const severityLevel = parseInt(severity);
      const type: NotificationConfig['type'] =
        severityLevel <= 3 ? 'error' :
        severityLevel === 4 ? 'warning' : 'info';

      showNotification({
        title: 'Status Message',
        content: statusText,
        type
      });

      if (severityLevel <= 4) callout(statusText, severityLevel <= 3);
    },

    MAG_CAL_PROGRESS: (text: string) => {
      const p = parseMagCalProgress(text);
      if (p) calibrationStore.update((s) => ({ ...s, progress: p.completionPct }));
    },

    MAG_CAL_REPORT: (text: string) => {
      const r = parseMagCalReport(text);
      if (r) calibrationStore.update((s) => ({ ...s, status: r.failed ? 'failed' : r.done ? 'done' : s.status, progress: r.done ? 100 : s.progress }));
    },

    PARAM_VALUE: (text: string) => {
      const paramId = extractValue(text, 'paramId');
      const paramValue = extractValue(text, 'paramValue');
      const paramType = extractValue(text, 'paramType');

      if (paramId && paramValue && paramType) {
          const decodedValue = decodeParameterValue(paramValue, paramType);
          if (decodedValue === null) return;
          let param: Parameter = {
              param_id: paramId,
              param_value: decodedValue,
              param_type: parseInt(paramType),
              param_count: parseInt(extractValue(text, 'paramCount') || '0'),
              param_index: parseInt(extractValue(text, 'paramIndex') || '0')
          };
          // update the store at the index of the parameter
          let params = get(mavlinkParamStore);
          params[paramId] = param;
          mavlinkParamStore.set(params);
      }
    },

    // Traffic reported by the vehicle's own ADS-B receiver.
    ADSB_VEHICLE: (text: string) => {
      const first = text.indexOf('::');
      const second = first >= 0 ? text.indexOf('::', first + 2) : -1;
      if (second < 0) return;
      try {
        const m = JSON.parse(text.slice(second + 2));
        if (typeof m.lat !== 'number' || typeof m.lon !== 'number' || (m.lat === 0 && m.lon === 0)) return;
        const icaoHex = Number(m.icaoAddress ?? 0).toString(16).toUpperCase();
        upsertTraffic([
          {
            id: `mav-${icaoHex}`,
            callsign: String(m.callsign ?? '').trim() || `ICAO ${icaoHex}`,
            lat: m.lat / 1e7,
            lon: m.lon / 1e7,
            altM: typeof m.altitude === 'number' ? m.altitude / 1000 : null,
            headingDeg: typeof m.heading === 'number' ? m.heading / 100 : null,
            speedMps: typeof m.horVelocity === 'number' ? m.horVelocity / 100 : null,
            verticalRateMps: typeof m.verVelocity === 'number' ? m.verVelocity / 100 : null,
            onGround: false,
            source: 'vehicle',
            seenAt: Date.now()
          }
        ]);
      } catch {
        // Malformed entry; skip it.
      }
    }
  };

  const FLIGHT_LOG_FLUSH_MS = 3000;

  // Temporary flight restrictions over the operating area, shown as persistent
  // notices that stay until dismissed. A dismissed notice is remembered so it
  // never reappears, and each id shows at most one live toast.
  const NOTAM_CHECK_MS = 5 * 60 * 1000;
  const NOTAM_RETRY_MS = 20 * 1000;
  let notamRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let notamDismissed = new Set<string>();

  function scheduleNotamRetry() {
    clearTimeout(notamRetryTimer);
    notamRetryTimer = setTimeout(() => void checkNotams(), NOTAM_RETRY_MS);
  }

  // Auth resolves after mount, so the first check fires once the session is active.
  $effect(() => {
    const active = loggedIn && !isNavHidden;
    if (active)
      untrack(() => {
        void checkNotams();
        void hydrateSafetyLimits();
      });
  });

  // The saved limits from Integrations back every pre-flight and takeoff check.
  async function hydrateSafetyLimits() {
    let saved: { maxAltitudeM?: number; minAltitudeM?: number; geofenceRadiusM?: number };
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) return;
      saved = (await res.json()).safety ?? {};
    } catch {
      return;
    }
    safetyLimitsStore.update((cur) => ({
      ...cur,
      maxAltitudeM: Number(saved.maxAltitudeM) || cur.maxAltitudeM,
      minAltitudeM: Number.isFinite(Number(saved.minAltitudeM)) ? Number(saved.minAltitudeM) : cur.minAltitudeM,
      geofenceRadiusM: Number(saved.geofenceRadiusM) || cur.geofenceRadiusM
    }));
  }

  const TRAFFIC_ALERT_MS = 15_000;

  // Advisory only. Network ADS-B arrives seconds late, so the station alerts
  // and the operator maneuvers.
  $effect(() => {
    const contacts = Object.values($trafficStore);
    untrack(() => {
      if (!loggedIn || isNavHidden) return;
      const loc = get(mavLocationStore);
      const threats = detectThreats(
        {
          lat: loc.lat,
          lon: loc.lng,
          altM: get(mavAltitudeAmslStore),
          headingDeg: get(mavHeadingStore),
          speedMps: get(mavSpeedStore)
        },
        contacts
      );
      trafficThreatsStore.set(new Set(threats.map((t) => t.contact.id)));
      for (const t of threats) {
        const seconds = Math.round(t.tSec);
        notify({
          key: `traffic:${t.contact.id}`,
          title: m.traffic_alert_title(),
          content:
            seconds < 1
              ? m.traffic_alert_now({ callsign: t.contact.callsign, meters: Math.round(t.horizontalM) })
              : m.traffic_alert_body({
                  callsign: t.contact.callsign,
                  meters: Math.round(t.horizontalM),
                  seconds
                }),
          type: 'warning',
          duration: TRAFFIC_ALERT_MS
        });
      }
    });
  });

  async function checkNotams() {
    if (!loggedIn || isNavHidden) return;
    const loc = get(mavLocationStore);
    if (!loc) return;
    let payload: { notams?: Notam[]; error?: string; state?: string | null };
    try {
      const res = await fetch(`/api/notams?lat=${loc.lat}&lon=${loc.lng}`);
      if (!res.ok) {
        scheduleNotamRetry();
        return;
      }
      payload = await res.json();
    } catch {
      scheduleNotamRetry();
      return;
    }
    const all = payload.notams ?? [];
    // A transient upstream failure must not blank an overlay still in effect.
    if (!payload.error && payload.state != null) {
      tfrOverlaysStore.set(all.filter((n) => n.boundary));
    } else {
      scheduleNotamRetry();
    }
    for (const n of unseenNotams(all, notamDismissed)) {
      const detail = notamDetailLine(n);
      const place = cleanTfrDescription(n.description);
      const body = detail ? `${n.type}: ${place}<br>${detail}` : `${n.type}: ${place}`;
      const boundary = n.boundary;
      notify({
        key: `notam:${n.id}`,
        title: m.notam_title({ id: n.id }),
        content: body,
        type: 'warning',
        persistent: true,
        link: { href: n.link, label: m.notam_faa_detail() },
        action: boundary ? { label: m.notam_on_map(), onClick: () => mapFocusStore.set(boundary) } : undefined,
        onDismiss: () => {
          notamDismissed.add(n.id);
          recordDismissedNotam(n.id);
        }
      });
    }
  }

  async function getLogs(text: string) {
    // truncate old logs to save memory
    logs = logs.slice(-LOG_HISTORY_LIMIT);

    if (!text || logs.includes(text)) return;

    logs = [...logs, text];
    mavlinkLogStore.set(logs);
    recordFlightLine(text);

    // Find which message type this is and process it
    for (const [messageType, handler] of Object.entries(messageHandlers)) {
      if (text.includes(messageType)) {
        handler(text);
        break;
      }
    }
  }

  onMount(() => {
    const startupTimer = setTimeout(() => {
      if (isNavHidden) return;
      checkLoadedMission();
      requestParameters();
      // Ask the vehicle whether it advertises a camera stream (message 269);
      // an advertised uri becomes a one-click RTSP source for the live feed.
      sendMavlinkCommand('REQUEST_MESSAGE', [269], { cmdLong: true });
    }, STARTUP_SYNC_DELAY_MS);

    const checkCookieInterval = setInterval(() => {
      // Auth pages have no session to expire; without this guard an epoch
      // cookie loops handleLogout's goto every second and each same-route
      // navigation resets input focus on the login form.
      if (isNavHidden) return;
      const lastActivity = parseInt(document.cookie.replace(/(?:(?:^|.*;\s*)lastActivity\s*=\s*([^;]*).*$)|^.*$/, '$1'));
      if (Date.now() - lastActivity > IDLE_LOGOUT_MS) {
        loggedInStore.set(false);
        handleLogout();
      } else {
        loggedInStore.set(true);
      }
    }, IDLE_POLL_MS);

    // Set up event listeners for user activity
    window.addEventListener('mousemove', refreshCookie);
    window.addEventListener('keydown', refreshCookie);
    window.addEventListener('click', refreshCookie);
    window.addEventListener('scroll', refreshCookie);

    const statusCheckInterval = setInterval(checkOnlineStatus, HEARTBEAT_POLL_MS);
    const flightLogInterval = setInterval(flushFlightLog, FLIGHT_LOG_FLUSH_MS);
    notamDismissed = loadDismissedNotams();
    const notamInterval = setInterval(() => void checkNotams(), NOTAM_CHECK_MS);

    const teardownCallouts = initCallouts();
    const teardownAlerts = initAlerts();

    return () => {
      clearTimeout(startupTimer);
      clearInterval(checkCookieInterval);
      clearInterval(statusCheckInterval);
      clearInterval(flightLogInterval);
      clearInterval(notamInterval);
      clearTimeout(notamRetryTimer);
      void flushFlightLog();
      window.removeEventListener('mousemove', refreshCookie);
      window.removeEventListener('keydown', refreshCookie);
      window.removeEventListener('click', refreshCookie);
      window.removeEventListener('scroll', refreshCookie);
      closeTelemetryStream();
      resizeObserver?.disconnect();
      teardownCallouts();
      teardownAlerts();
      stopCallouts();
    };
  });

  function refreshCookie() {
    if (loggedIn) document.cookie = 'lastActivity=' + Date.now();
  }

  function handleLogout() {
    loggedInStore.set(false);
    document.cookie = 'lastActivity=' + Date.UTC(1970);
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    const path = window.location.pathname;
    if (!path.includes('register') && path !== '/login') goto('/login');
  }

  function handleNavigation(path: string, target: string = '') {
    if (target === '_blank') window.open(path, target);
    else if (currentPath !== path) goto(path);
  }

  function toggleNav() {
    isNavOpen = !isNavOpen;
  }

  function toggleDarkMode() {
    darkModeStore.set(!get(darkModeStore));
  }

  function toggleAudioCallouts() {
    const next = !get(audioCalloutsStore);
    audioCalloutsStore.set(next);
    if (!next) stopCallouts();
  }

  // The nav column scrolls, so its tooltips are fixed-positioned to escape the
  // scroll container's clip and placed beside their button on hover.
  const LOCALE_NAMES: Record<string, string> = {
    en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français', it: 'Italiano',
    nl: 'Nederlands', pl: 'Polski', pt: 'Português', ru: 'Русский', sv: 'Svenska',
    tr: 'Türkçe', uk: 'Українська', ja: '日本語', ko: '한국어',
    'zh-CN': '简体中文', 'zh-TW': '繁體中文'
  };
  const currentLocale = getLocale();
  let langOpen = $state(false);
  function localeName(code: string): string {
    return LOCALE_NAMES[code] ?? code;
  }
  async function chooseLocale(code: Locale) {
    langOpen = false;
    if (code === currentLocale) return;
    // Persist for server-side flows (alert and reset emails) with no request cookie.
    await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uiLocale: code })
    }).catch(() => undefined);
    setLocale(code);
  }

  function navTooltips(container: HTMLElement) {
    function place(e: Event) {
      const btn = (e.target as HTMLElement).closest('.nav-button') as HTMLElement | null;
      const tip = btn?.querySelector('.tooltip') as HTMLElement | null;
      if (!btn || !tip) return;
      const r = btn.getBoundingClientRect();
      tip.style.top = `${r.top + r.height / 2}px`;
      tip.style.left = `${r.right + 12}px`;
    }
    container.addEventListener('mouseover', place);
    return { destroy: () => container.removeEventListener('mouseover', place) };
  }
</script>

<main class="bg-black flex overflow-auto"
  style="--heightOfDashboard: {heightOfDashboard}px;"
>
  <Map />
  <div class="dark-mode-btn absolute top-2 left-2 z-20">
    <button class="nav-button" aria-label="Toggle Dark Mode" onclick={toggleDarkMode}>
      <i class="nav-icon fas {darkMode ? 'fa-sun' : 'fa-moon'}"></i>
    </button>
  </div>
  <div class="flex w-full h-full z-10">
    <!-- Desktop Navigation -->
    <nav class="desktop-nav w-min h-full p-4 flex flex-col opacity-0 z-20" style:display={isNavHidden ? 'none' : 'flex'} use:navTooltips>
      <div class="shrink-0 mb-5 flex justify-center">
        <button onclick={(e) => { e.preventDefault(); handleNavigation('/'); }}>
          <img src="/logo.png" alt="Logo" class="w-12 h-12 min-w-[3rem] object-contain">
        </button>
      </div>
      <div class="nav-scroll flex-1 min-h-0 overflow-y-auto flex flex-col items-center">
        {#if loggedIn}
        <a href="/dashboard" class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
          <i class="nav-icon fas fa-tachometer-alt"></i>
          <div class="tooltip text-white">{m.nav_dashboard()}</div>
        </a>
        <a href="/mission-planner" class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
          <i class="nav-icon fas fa-route"></i>
          <div class="tooltip text-white">{m.nav_mission_planner()}</div>
        </a>
        <a href="/event-log" class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
          <i class="nav-icon fas fa-bars-staggered"></i>
          <div class="tooltip text-white">{m.nav_event_log()}</div>
        </a>
        <a href="/parameters" class="nav-button mb-4 {currentPath === '/parameters' ? 'active' : ''}">
          <i class="nav-icon fas fa-cog"></i>
          <div class="tooltip text-white">{m.nav_parameters()}</div>
        </a>
        <a href="/calibration" class="nav-button mb-4 {currentPath === '/calibration' ? 'active' : ''}">
          <i class="nav-icon fas fa-crosshairs"></i>
          <div class="tooltip text-white">{m.nav_calibration()}</div>
        </a>
        <a href="/firmware" class="nav-button mb-4 {currentPath === '/firmware' ? 'active' : ''}">
          <i class="nav-icon fas fa-microchip"></i>
          <div class="tooltip text-white">{m.nav_firmware()}</div>
        </a>
        <a href="/integrations" class="nav-button mb-4 {currentPath === '/integrations' ? 'active' : ''}">
          <i class="nav-icon fas fa-plug"></i>
          <div class="tooltip text-white">{m.nav_integrations()}</div>
        </a>
        <a href="/alerts" class="nav-button mb-4 {currentPath === '/alerts' ? 'active' : ''}">
          <i class="nav-icon fas fa-bell"></i>
          <div class="tooltip text-white">{m.nav_alerts()}</div>
        </a>
        <div class="separator h-[2px] w-[80%] rounded-2xl mb-4"></div>
        <a href="/login" onclick={(e) => { e.preventDefault(); handleLogout(); }} class="nav-button mb-4">
          <i class="nav-icon fas fa-sign-out-alt"></i>
          <div class="tooltip text-white">{m.nav_logout()}</div>
        </a>
        {:else}
        <a href="/login" class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
          <i class="nav-icon fas fa-sign-in-alt"></i>
          <div class="tooltip text-white">{m.nav_login()}</div>
        </a>
        {/if}
      </div>
      <div class="nav-footer shrink-0 flex flex-col items-center gap-3 pt-4">
        <div class="separator h-[2px] w-[80%] mb-1 rounded-2xl"></div>
        <button class="nav-button" onclick={toggleAudioCallouts}>
          <i class="nav-icon fas {$audioCalloutsStore ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
          <div class="tooltip text-white">{m.nav_audio_callouts()}</div>
        </button>
        <button class="nav-button" aria-label="Dark Mode" onclick={toggleDarkMode}>
          <i class="nav-icon fas {darkMode ? 'fa-sun' : 'fa-moon'}"></i>
          <div class="tooltip text-white">{m.nav_dark_mode()}</div>
        </button>
        <div class="lang-picker">
          <button class="nav-button" aria-label="Language" aria-haspopup="listbox" aria-expanded={langOpen} onclick={() => (langOpen = !langOpen)}>
            <i class="nav-icon fas fa-globe"></i>
            <div class="tooltip text-white">{m.nav_language()}</div>
          </button>
          {#if langOpen}
            <ul class="lang-menu" role="listbox">
              {#each locales as code (code)}
                <li>
                  <button type="button" role="option" aria-selected={code === currentLocale} class:selected={code === currentLocale} onclick={() => chooseLocale(code)}>
                    {localeName(code)}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </nav>

    <!-- Mobile Navigation -->
    <nav class="mobile-nav p-4 md:hidden flex flex-col z-20">
      <div class="flex justify-between items-center">
        <button class="nav-button" aria-label="Toggle Navigation" onclick={toggleNav}>
          <i class="nav-icon fas fa-bars"></i>
        </button>
        <span class="text-xl font-semibold">Canary Ground Control</span>
        <a href="/" onclick={(e) => { e.preventDefault(); handleNavigation('/'); }}>
          <img src="/logo.png" alt="Logo" class="w-8 h-8 min-w-[2rem] object-contain">
        </a>
      </div>
      <div class={`mobile-nav-links ${isNavOpen ? 'block' : 'hidden'} flex flex-col items-center mt-4`}>
        {#if loggedIn}
          <a href="/dashboard" onclick={(e) => { e.preventDefault(); handleNavigation('/dashboard'); }} class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
            <i class="nav-icon fas fa-tachometer-alt"></i>&nbsp;&nbsp;{m.nav_dashboard()}
          </a>
          <a href="/mission-planner" onclick={(e) => { e.preventDefault(); handleNavigation('/mission-planner'); }} class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
            <i class="nav-icon fas fa-route"></i>&nbsp;&nbsp;{m.nav_mission_planner()}
          </a>
          <a href="/event-log" onclick={(e) => { e.preventDefault(); handleNavigation('/event-log'); }} class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
            <i class="nav-icon fas fa-bars-staggered"></i>&nbsp;&nbsp;{m.nav_event_log()}
          </a>
          <a href="/parameters" onclick={(e) => { e.preventDefault(); handleNavigation('/parameters'); }} class="nav-button mb-4 {currentPath === '/parameters' ? 'active' : ''}">
            <i class="nav-icon fas fa-cog"></i>&nbsp;&nbsp;{m.nav_parameters()}
          </a>
          <a href="/calibration" onclick={(e) => { e.preventDefault(); handleNavigation('/calibration'); }} class="nav-button mb-4 {currentPath === '/calibration' ? 'active' : ''}">
            <i class="nav-icon fas fa-crosshairs"></i>&nbsp;&nbsp;{m.nav_calibration()}
          </a>
          <a href="/firmware" onclick={(e) => { e.preventDefault(); handleNavigation('/firmware'); }} class="nav-button mb-4 {currentPath === '/firmware' ? 'active' : ''}">
            <i class="nav-icon fas fa-microchip"></i>&nbsp;&nbsp;{m.nav_firmware()}
          </a>
          <a href="/integrations" onclick={(e) => { e.preventDefault(); handleNavigation('/integrations'); }} class="nav-button mb-4 {currentPath === '/integrations' ? 'active' : ''}">
            <i class="nav-icon fas fa-plug"></i>&nbsp;&nbsp;{m.nav_integrations()}
          </a>
          <a href="/alerts" onclick={(e) => { e.preventDefault(); handleNavigation('/alerts'); }} class="nav-button mb-4 {currentPath === '/alerts' ? 'active' : ''}">
            <i class="nav-icon fas fa-bell"></i>&nbsp;&nbsp;{m.nav_alerts()}
          </a>
          <button onclick={toggleAudioCallouts} class="nav-button mb-4" type="button">
            <i class="nav-icon fas {$audioCalloutsStore ? 'fa-volume-up' : 'fa-volume-mute'}"></i>&nbsp;&nbsp;{$audioCalloutsStore ? m.nav_audio_on() : m.nav_audio_off()}
          </button>
          <div class="lang-picker mb-4">
            <button class="nav-button" type="button" aria-haspopup="listbox" aria-expanded={langOpen} onclick={() => (langOpen = !langOpen)}>
              <i class="nav-icon fas fa-globe"></i>&nbsp;&nbsp;{m.nav_language()}
            </button>
            {#if langOpen}
              <ul class="lang-menu lang-menu-mobile" role="listbox">
                {#each locales as code (code)}
                  <li>
                    <button type="button" role="option" aria-selected={code === currentLocale} class:selected={code === currentLocale} onclick={() => chooseLocale(code)}>
                      {localeName(code)}
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          <button onclick={(e) => { e.preventDefault(); handleLogout(); }} class="nav-button mb-4" type="button">
            <i class="nav-icon fas fa-sign-out-alt"></i>&nbsp;&nbsp;{m.nav_logout()}
          </button>
        {:else}
          <a href="/login" onclick={(e) => { e.preventDefault(); handleNavigation('/login'); }} class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
            <i class="nav-icon fas fa-sign-in-alt"></i>&nbsp;&nbsp;{m.nav_login()}
          </a>
        {/if}
      </div>
    </nav>

    <div class="slot-container flex-grow { !isNavHidden ? 'pr-8' : '' } justify-center items-center overflow-auto z-10">
      {@render children?.()}
    </div>

    {#if !online && !mavlinkDisabled && !isNavHidden}
      <Offline />
    {/if}
    {#if !isNavHidden}
      <GuidancePanel />
    {/if}
  </div>
</main>

<style>
  .dark-mode-btn {
    z-index: 25;
    background-color: rgb(from var(--primaryColor) r g b / 0.5);
    border-radius: 50%;
    display: none;
  }

  .dark-mode-btn button:hover {
    color: var(--fontColor);
    background-color: transparent;
  }

  .separator {
    background-color: var(--tertiaryColor);
  }

  main {
    pointer-events: none;
  }

  .desktop-nav,
  .mobile-nav,
  .dark-mode-btn {
    pointer-events: auto;
  }

  .slot-container > :global(*) {
    pointer-events: auto;
  }

  .desktop-nav {
    align-self: center;
    color: var(--fontColor);
    background-color: var(--primaryColor);
    border: 5px solid rgb(from var(--secondaryColor) r g b / 0.85);
    border-right: none;
    border-radius: var(--radius-shell) 0 0 var(--radius-shell);
    margin-left: 2em;
    max-height: 90vh;
    height: var(--heightOfDashboard);
    transition: height 0s;
    transition: opacity 0.25s;
  }

  .mobile-nav {
    color: var(--fontColor);
    background-color: var(--primaryColor);
  }

  .nav-button {
    width: 40px;
    height: 40px;
    display: flex;
    position: relative;
    justify-content: center;
    align-items: center;
    background-color: transparent;
    border-radius: var(--radius-control);
    color: #8d8d8e;
  }

  .nav-button:hover {
    background-color: var(--secondaryColor);
  }

  .nav-button:hover, .nav-button.active {
    color: white;
  }

  .nav-button.active {
    background-color: var(--tertiaryColor);
  }

  .nav-icon {
    font-size: 18px;
  }

  /* Fixed-positioned (JS places it beside the button) so it escapes the
     scrollable nav's clip, but kept the app tooltip blue and sitting right
     next to its button, matching the map chrome tooltips. */
  .tooltip {
    position: fixed;
    transform: translateY(-50%);
    padding: 0.3rem 0.6rem;
    border-radius: var(--radius-control);
    white-space: nowrap;
    font-size: 0.8rem;
    color: #fff;
    background-color: #3290e7;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease, visibility 0.15s ease;
    z-index: 60;
    pointer-events: none;
  }

  .nav-button:hover .tooltip {
    opacity: 1;
    visibility: visible;
  }

  .lang-picker {
    position: relative;
  }
  .lang-menu {
    position: absolute;
    left: calc(100% + 12px);
    bottom: 0;
    list-style: none;
    margin: 0;
    padding: 0.25rem;
    background: var(--secondaryColor);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-control);
    min-width: 8.5rem;
    z-index: 60;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }
  .lang-menu li {
    margin: 0;
  }
  .lang-menu button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.6rem;
    border: none;
    background: transparent;
    color: #cfd3d8;
    border-radius: var(--radius-control);
    cursor: pointer;
    white-space: nowrap;
  }
  .lang-menu button:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .lang-menu button.selected {
    color: #fff;
    font-weight: 600;
  }
  .lang-menu-mobile {
    left: 0;
    bottom: auto;
    top: 100%;
    margin-top: 0.25rem;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    main > div {
      flex-direction: column;
    }

    .dark-mode-btn {
      top: unset;
      left: unset;
      right: 1rem;
      bottom: 1rem;
      padding: 0.5rem;
      background-color: var(--tertiaryColor);
      border: 1px solid var(--secondaryColor);
      display: unset;
    }

    .slot-container {
      padding: 0;
      overflow: hidden;
    }

    .desktop-nav {
      display: none !important;
    }

    .mobile-nav {
      display: flex;
      background-color: var(--primaryColor);
    }

    .mobile-nav-links {
      display: flex;
      flex-direction: column;
      width: 100%;
    }

    .mobile-nav-links a, .mobile-nav-links button {
      width: 100%;
      text-align: center;
    }

    .mobile-nav-links.hidden {
      display: none;
    }
  }
</style>
