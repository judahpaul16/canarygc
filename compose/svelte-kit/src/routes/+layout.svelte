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
    mavlinkLogStore,
    mavlinkParamStore,
    mavAltitudeStore,
    mavSpeedStore,
    mavModelStore,
    mavTypeStore,
    mavStateStore,
    mavModeStore,
    mavBatteryStore,
    mavArmedStateStore,
    mavSatelliteStore,
    type Parameter
  } from '../stores/mavlinkStore';
  import {
    missionPlanTitleStore,
    missionPlanActionsStore,
    missionCountStore,
    missionIndexStore,
    missionCompleteStore
  } from '../stores/missionPlanStore';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore,
    audioCalloutsStore
  } from '../stores/customizationStore';
  import { loggedInStore } from '../stores/authStore';
  import { get } from 'svelte/store';
  import Offline from '../components/Offline.svelte';
  import { notify, type NotificationType } from '../lib/overlays';
  import { callout, initCallouts, stopCallouts } from '../lib/callouts';
  import { initAlerts } from '../lib/alerts';
  import { decodeMode, isArmed } from '../lib/flight-modes';
  import { decodeParameterValue, requestParameters } from '../lib/mavlink-client';
  import { mapTypeStore } from '../stores/mapStore';

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
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');
  const AUTH_PAGES = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password']);

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

  function setOnline(value: boolean) {
    if (value) {
      consecutiveMisses = 0;
      if (!online) onlineStore.set(true);
      return;
    }
    consecutiveMisses += 1;
    if (consecutiveMisses >= OFFLINE_AFTER_MISSES && online) onlineStore.set(false);
  }

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
        if (data.length > 0) {
          data.forEach((log: string) => {
            getLogs(log.replace(/\\"/g, '"') + '\n');
          });
          setOnline(true);
        } else {
          setOnline(false);
        }
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
          missionPlanTitleStore.set(loadedMission.title);
          missionPlanActionsStore.set(JSON.parse(loadedMission.actions));
          try {
              let response = await fetch("/api/mavlink/load_mission", {
                  method: "POST",
                  headers: {
                      "content-type": "application/json",
                      "actions": JSON.stringify(loadedMission.actions),
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

      const speed = calculateSpeed(text);
      if (speed) mavSpeedStore.set(parseFloat(speed.toFixed(2)));
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

    PARAM_VALUE: (text: string) => {
      const paramId = extractValue(text, 'paramId');
      const paramValue = extractValue(text, 'paramValue');
      const paramType = extractValue(text, 'paramType');

      if (paramId && paramValue && paramType) {
          let param: Parameter = {
              param_id: paramId,
              param_value: decodeParameterValue(paramValue, paramType),
              param_type: parseInt(paramType),
              param_count: parseInt(extractValue(text, 'paramCount') || '0'),
              param_index: parseInt(extractValue(text, 'paramIndex') || '0')
          };
          // update the store at the index of the parameter
          let params = get(mavlinkParamStore);
          params[paramId] = param;
          mavlinkParamStore.set(params);
      }
    }
  };

  async function getLogs(text: string) {
    // truncate old logs to save memory
    logs = logs.slice(-LOG_HISTORY_LIMIT);

    if (!text || logs.includes(text)) return;

    logs = [...logs, text];
    mavlinkLogStore.set(logs);

    // Find which message type this is and process it
    for (const [messageType, handler] of Object.entries(messageHandlers)) {
      if (text.includes(messageType)) {
        handler(text);
        break;
      }
    }
  }

  onMount(() => {
    if (localStorage.getItem('darkMode') === 'false') darkModeStore.set(false);

    const startupTimer = setTimeout(() => {
      if (isNavHidden) return;
      checkLoadedMission();
      requestParameters();
    }, STARTUP_SYNC_DELAY_MS);

    const checkCookieInterval = setInterval(() => {
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

    const teardownCallouts = initCallouts();
    const teardownAlerts = initAlerts();

    return () => {
      clearTimeout(startupTimer);
      clearInterval(checkCookieInterval);
      clearInterval(statusCheckInterval);
      window.removeEventListener('mousemove', refreshCookie);
      window.removeEventListener('keydown', refreshCookie);
      window.removeEventListener('click', refreshCookie);
      window.removeEventListener('scroll', refreshCookie);
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
    if (!window.location.pathname.includes('register')) goto('/login');
  }

  function handleNavigation(path: string, target: string = '') {
    if (target === '_blank') window.open(path, target);
    else if (currentPath !== path) goto(path);
  }

  function toggleNav() {
    isNavOpen = !isNavOpen;
  }

  function toggleDarkMode() {
    const next = !get(darkModeStore);
    darkModeStore.set(next);
    localStorage.setItem('darkMode', String(next));
    const map = document.getElementById('map');
    if (map && get(mapTypeStore) !== 'Satellite') {
      map.classList.toggle('dark', next);
    }
  }

  function toggleAudioCallouts() {
    const next = !get(audioCalloutsStore);
    audioCalloutsStore.set(next);
    if (!next) stopCallouts();
  }
</script>

<main class="bg-black flex overflow-auto"
  style="--heightOfDashboard: {heightOfDashboard}px; --primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <div class="bg fixed w-full h-full" style="background-image: url('{darkMode ? 'bg-map.webp' : 'bg-map-light.webp'}');"></div>
  <div class="dark-mode-btn absolute top-2 left-2 z-20">
    <button class="nav-button" aria-label="Toggle Dark Mode" onclick={toggleDarkMode}>
      <i class="nav-icon fas {darkMode ? 'fa-sun' : 'fa-moon'}"></i>
    </button>
  </div>
  <div class="bg-[#0000001f] flex w-full h-full z-10">
    <!-- Desktop Navigation -->
    <nav class="desktop-nav w-min h-full p-4 grid opacity-0 z-20" style:display={isNavHidden ? 'none' : 'grid'}>
      <div class="flex-grow flex flex-col items-center">
        <div class="mb-5">
          <button onclick={(e) => { e.preventDefault(); handleNavigation('/'); }}>
            <img src="/logo.png" alt="Logo" class="w-12 h-12 min-w-[3rem] object-contain">
          </button>
        </div>
        {#if loggedIn}
        <a href="/dashboard" class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
          <i class="nav-icon fas fa-tachometer-alt"></i>
          <div class="tooltip text-white">Dashboard</div>
        </a>
        <a href="/mission-planner" class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
          <i class="nav-icon fas fa-route"></i>
          <div class="tooltip text-white">Mission Planner</div>
        </a>
        <a href="/event-log" class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
          <i class="nav-icon fas fa-bars-staggered"></i>
          <div class="tooltip text-white">Event Log</div>
        </a>
        <a href="/parameters" class="nav-button mb-4 {currentPath === '/parameters' ? 'active' : ''}">
          <i class="nav-icon fas fa-cog"></i>
          <div class="tooltip text-white">Vehicle Parameters</div>
        </a>
        <a href="/integrations" class="nav-button mb-4 {currentPath === '/integrations' ? 'active' : ''}">
          <i class="nav-icon fas fa-plug"></i>
          <div class="tooltip text-white">Integrations</div>
        </a>
        <a href="/alerts" class="nav-button mb-4 {currentPath === '/alerts' ? 'active' : ''}">
          <i class="nav-icon fas fa-bell"></i>
          <div class="tooltip text-white">Alerts</div>
        </a>
        <div class="separator h-[2px] w-[80%] rounded-2xl mb-4"></div>
        <a href="/login" onclick={(e) => { e.preventDefault(); handleLogout(); }} class="nav-button mb-4">
          <i class="nav-icon fas fa-sign-out-alt"></i>
          <div class="tooltip text-white">Logout</div>
        </a>
        {:else}
        <a href="/login" class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
          <i class="nav-icon fas fa-sign-in-alt"></i>
          <div class="tooltip text-white">Login</div>
        </a>
        {/if}
      </div>
      <div class="flex flex-col justify-self-end gap-3">
        <button class="nav-button" onclick={toggleAudioCallouts}>
          <i class="nav-icon fas {$audioCalloutsStore ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
          <div class="tooltip text-white">Toggle Audio Callouts</div>
        </button>
        <div class="separator h-[2px] w-[80%] mx-auto mb-2 rounded-2xl"></div>
        <button class="nav-button" aria-label="Dark Mode" onclick={toggleDarkMode}>
          <i class="nav-icon fas {darkMode ? 'fa-sun' : 'fa-moon'}"></i>
          <div class="tooltip text-white">Toggle Dark Mode</div>
        </button>
      </div>
    </nav>

    <!-- Mobile Navigation -->
    <nav
      class="mobile-nav p-4 md:hidden flex flex-col z-20"
      style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
    >
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
            <i class="nav-icon fas fa-tachometer-alt"></i>&nbsp;&nbsp;Dashboard
          </a>
          <a href="/mission-planner" onclick={(e) => { e.preventDefault(); handleNavigation('/mission-planner'); }} class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
            <i class="nav-icon fas fa-route"></i>&nbsp;&nbsp;Mission Planner
          </a>
          <a href="/event-log" onclick={(e) => { e.preventDefault(); handleNavigation('/event-log'); }} class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
            <i class="nav-icon fas fa-bars-staggered"></i>&nbsp;&nbsp;Event Log
          </a>
          <a href="/parameters" onclick={(e) => { e.preventDefault(); handleNavigation('/parameters'); }} class="nav-button mb-4 {currentPath === '/parameters' ? 'active' : ''}">
            <i class="nav-icon fas fa-cog"></i>&nbsp;&nbsp;Vehicle Parameters
          </a>
          <a href="/integrations" onclick={(e) => { e.preventDefault(); handleNavigation('/integrations'); }} class="nav-button mb-4 {currentPath === '/integrations' ? 'active' : ''}">
            <i class="nav-icon fas fa-plug"></i>&nbsp;&nbsp;Integrations
          </a>
          <a href="/alerts" onclick={(e) => { e.preventDefault(); handleNavigation('/alerts'); }} class="nav-button mb-4 {currentPath === '/alerts' ? 'active' : ''}">
            <i class="nav-icon fas fa-bell"></i>&nbsp;&nbsp;Alerts
          </a>
          <button onclick={toggleAudioCallouts} class="nav-button mb-4" type="button">
            <i class="nav-icon fas {$audioCalloutsStore ? 'fa-volume-up' : 'fa-volume-mute'}"></i>&nbsp;&nbsp;Audio Callouts {$audioCalloutsStore ? 'On' : 'Off'}
          </button>
          <button onclick={(e) => { e.preventDefault(); handleLogout(); }} class="nav-button mb-4" type="button">
            <i class="nav-icon fas fa-sign-out-alt"></i>&nbsp;&nbsp;Logout
          </button>
        {:else}
          <a href="/login" onclick={(e) => { e.preventDefault(); handleNavigation('/login'); }} class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
            <i class="nav-icon fas fa-sign-in-alt"></i>&nbsp;&nbsp;Login
          </a>
        {/if}
      </div>
    </nav>

    <div class="slot-container flex-grow { !isNavHidden ? 'pr-8' : '' } justify-center items-center overflow-auto z-10">
      {@render children?.()}
    </div>

    {#if !online && !isNavHidden}
      <Offline />
    {/if}
  </div>
</main>

<style>
  .bg {
    background: url('bg-map.webp') no-repeat center center fixed;
    background-size: cover !important;
    margin: 0;
    filter: blur(2px);
  }

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

  .desktop-nav {
    align-content: space-between;
    align-self: center;
    color: var(--fontColor);
    background-color: var(--primaryColor);
    border: 5px solid rgb(from var(--secondaryColor) r g b / 0.85);
    border-right: none;
    border-radius: 30px 0 0 30px;
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
    border-radius: 5px;
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

  .tooltip {
    position: absolute;
    top: 0;
    left: 0;
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
    z-index: 1;
  }

  .nav-button:hover .tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(50px);
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
