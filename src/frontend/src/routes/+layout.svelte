<script lang="ts">
  import { MavType, MavState, MavAutopilot } from 'mavlink-mappings/dist/lib/minimal';
  import { MavCmd, MavResult } from 'mavlink-mappings/dist/lib/common';
  import { CopterMode } from 'mavlink-mappings/dist/lib/ardupilotmega';
  import PocketBase from 'pocketbase';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { authData } from '../stores/authStore';
  import { page } from '$app/stores';
  import { onMount, onDestroy, afterUpdate } from 'svelte';
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
    type Parameter,
    type ParameterMeta
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
    tertiaryColorStore
  } from '../stores/customizationStore';
  import { get } from 'svelte/store';
  import Offline from '../components/Offline.svelte';
  import Notification from '../components/Notification.svelte';
    import { mapTypeStore } from '../stores/mapStore';

  let pb: PocketBase;

  let currentPath = '';
  let heightOfDashboard = 1000;
  let logs: string[] = [];
  let online = get(onlineStore);

  let inactivityTimer: NodeJS.Timeout;
  let authCheckInterval: NodeJS.Timeout;
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  let logout = false;

  const batteryAlerts = [50, 20, 15, 10, 5];
  let batteryAlertIndex = 0;
  let batteryAlertShown = false;
  
  $: battery = $mavBatteryStore;
  $: online = $onlineStore;
  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';
  $: currentPath = $page.url.pathname;
  $: isNavHidden = currentPath === '/' || currentPath === '/login';
  $: missionCountStore.set(Object.keys($missionPlanActionsStore).length - 1);
  $: actions = $missionPlanActionsStore;
  $: if (battery && battery <= batteryAlerts[batteryAlertIndex] && !batteryAlertShown) {
    showNotification({
      title: 'Low Battery Alert',
      content: `Battery level is at ${battery}%. It's highly recommended to return to home or land immediately to prevent a crash.`,
      type: battery <= 20 ? 'error' : 'warning',
    });
    batteryAlertIndex++;
    batteryAlertShown = true;
  } else if (battery && battery > batteryAlerts[batteryAlertIndex]) {
    batteryAlertShown = false;
  }

  // @ts-ignore
  String.prototype.toProperCase = function () {
    return this.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();});
  };

  function updateDashboardHeight() {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      heightOfDashboard = dashboard.clientHeight;
      if (window.location.pathname !== '/') {
        heightOfDashboard = dashboard.clientHeight;
        if (window.location.pathname !== '/dashboard') heightOfDashboard += 1;
        let nav = document.querySelector('.desktop-nav');
        // @ts-ignore
        nav.style.opacity = 1;
        // @ts-ignore
        dashboard.style.opacity = 1;
      }
    }
  }

  let resizeObserver: ResizeObserver;

  async function checkOnlineStatus() {
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
          onlineStore.set(true);
        } else {
          onlineStore.set(false);
        }
      } else {
        onlineStore.set(false);
      }
  } catch (error: any) {
      console.error('Error:', error.message || error);
      console.error('Stack Trace:', error.stack || 'No stack trace available');
      onlineStore.set(false);

    }
  }

  async function checkLoadedMission() {
    try {
      const response = await pb.collection('mission_plans').getFullList();
      if (response.length > 0) {
        const loadedMission = response.find((mission: any) => mission.isLoaded === 1);
        if (loadedMission) {
          missionPlanTitleStore.set(loadedMission.title);
          missionPlanActionsStore.set(loadedMission.actions);
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
    } catch (error: any) {
      if (error.message.includes('The request was autocancelled')) {
        // ignore it
      } else {
        console.error('Error:', error.message || error);
        console.error('Stack Trace:', error.stack || 'No stack trace available');
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
    type: 'success' | 'warning' | 'error' | 'info';
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
    const notification = new Notification({
      target: document.body,
      props: {
        title: config.title,
        content: config.content,
        type: config.type
      }
    });
    setTimeout(() => notification.$destroy(), config.duration || 10000);
  };

  function decodeParameterValue(encodedValue: string, paramType: string): number {
    const value = parseFloat(encodedValue);
    const type = parseInt(paramType);
    
    if (isNaN(value)) {
        console.warn('Invalid parameter value:', encodedValue);
        return 0;
    }
    
    switch (type) {
        case 1: // uint8
            return Math.min(255, Math.max(0, Math.round(value)));
        case 2: // int8
            return Math.min(127, Math.max(-128, Math.round(value)));
        case 3: // uint16
            return Math.min(65535, Math.max(0, Math.round(value)));
        case 4: // int16
            return Math.min(32767, Math.max(-32768, Math.round(value)));
        case 5: // uint32
            return Math.min(4294967295, Math.max(0, Math.round(value)));
        case 6: // int32
            return Math.min(2147483647, Math.max(-2147483648, Math.round(value)));
        case 7: // uint64
        case 8: // int64
            console.warn('64-bit integers may not be fully precise in JavaScript');
            return value;
        case 9: // float
            return value;
        case 10: // double
            return value;
        default:
            console.warn('Unknown parameter type:', type);
            return value;
    }
  }

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
      let toProperCase = (str: string): string => {
        return str.replace(/\w\S*/g, function(txt) {
          return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
        });
      }
      const type = extractValue(text, 'type');
      if (type) mavTypeStore.set(toProperCase(MavType[parseInt(type)]));

      const model = extractValue(text, 'autopilot');
      if (model) mavModelStore.set(MavAutopilot[parseInt(model)]);

      const state = extractValue(text, 'systemStatus');
      if (state) mavStateStore.set(MavState[parseInt(state)]);

      const baseMode = extractValue(text, 'baseMode');
      if (baseMode) mavArmedStateStore.set(parseInt(baseMode) === 209);

      const customMode = extractValue(text, 'customMode');
      if (customMode) mavModeStore.set(CopterMode[parseInt(customMode)]);
    },

    MISSION_CURRENT: (text: string) => {
      const index = extractValue(text, 'seq');
      if (index) missionIndexStore.set(parseInt(index));
    },

    MISSION_ITEM_REACHED: (text: string) => {
      const index = extractValue(text, 'seq');
      if (!index) return;
      
      const indexNum = parseInt(index);
      if (indexNum === Object.keys($missionPlanActionsStore).length - 1) {
        missionCompleteStore.set(true);
      }

      const action = actions[indexNum];
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
    logs = logs.slice(-1000);

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

  async function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(handleInactivity, INACTIVITY_TIMEOUT);
    let adminAuthResponse = await pb.admins.authRefresh();
    authData.set({
          token: $authData ? $authData.token : adminAuthResponse.token,
          expires: Date.now() + 3600 * 1000, // Set expiration to 1 hour from now
          admin: $authData ? $authData.admin : adminAuthResponse.admin,
          record: null, // Set record to null since it's an admin response
        })
  }

  function handleInactivity() {
    if (authData.checkExpired()) {
      authData.set(null);
      goto('/login');
    }
  }

  function handleUserActivity() {
    if (!logout) resetInactivityTimer();
    authData.refreshTimestamp();
  }
  

  async function requestParameters() {
    try {
      const response = await fetch('/api/mavlink/request_params', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
      });
      if (!response.ok) throw new Error(await response.text());
    } catch (err: any) {
      console.error('Failed to request parameter:', err.message);
    }
  }

  onMount(async () => {
    // @ts-ignore
    document.querySelector('.bg')!.style.background = "url('bg-map.webp') no-repeat center center fixed";
    pb = new PocketBase(`http://${window.location.hostname}:8090`);
    pb.autoCancellation(false);
    
    setTimeout(() => {
      initializeMissionPlansCollection();
      checkLoadedMission();
      requestParameters();
    }, 2000);
    
    // Set up event listeners for user activity
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);

    // Initial setup of inactivity timer
    resetInactivityTimer();

    // Auth Checks
    authCheckInterval = setInterval(async () => {
      let adminExists = false;
      try {
        const admins = await pb.admins.getList(1, 1);
        adminExists = admins.items.length > 0;
      } catch (error: any) {
        console.error('Error:', error);
      }
      if (adminExists === false || (typeof window !== 'undefined' && authData.checkExpired() && window.location.pathname !== '/')) {
        authData.set(null);
        goto('/login');
      }
      await checkOnlineStatus();
    }, 1100);
    
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      resizeObserver = new ResizeObserver(() => {
        updateDashboardHeight();
      });
      resizeObserver.observe(dashboard);
    }
    
    updateDashboardHeight();
  });

  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    clearInterval(authCheckInterval);
    clearTimeout(inactivityTimer);
  });

  afterUpdate(() => {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      resizeObserver = new ResizeObserver(() => {
        updateDashboardHeight();
      });
      resizeObserver.observe(dashboard);
    }
    if (window.location.pathname === '/' || window.location.pathname === '/login') {
      // @ts-ignore
      document.querySelector('.desktop-nav').style.display = 'none';
    } else {
      // @ts-ignore
      document.querySelector('.desktop-nav').style.display = 'grid';
    }
  });

  async function initializeMissionPlansCollection() {
    try {
      const collections = await pb.collections.getFullList();
      const collectionExists = collections.some(c => c.name === 'mission_plans');
      
      if (!collectionExists) {
        const newCollection = {
          name: 'mission_plans',
          type: 'base',
          schema: [
            { name: 'title', type: 'text', default: 'Untitled Mission', options: { maxSize: 100000000 } },
            { name: 'actions', type: 'json', required: true, options: { maxSize: 100000000 } },
            { name: 'isLoaded', type: 'number', default: 0 }
          ]
        };
        await pb.collections.create(newCollection);
        console.log('Collection "mission_plans" created successfully.');
      }
    } catch (error: any) {
      if (error.message.includes('The request was autocancelled')) {
        // ignore it
      } else {
        console.error('Error:', error);
      }
    }
  }

  function handleNavigation(path: string, target: string = '') {
    if (target === '_blank') window.open(path, target);
    else if (currentPath !== path) goto(path);
  }

  function handleLogout() {
    logout = true;
    authData.logout();
    goto('/login');
  }

  let isNavOpen = false;
  function toggleNav() {
    isNavOpen = !isNavOpen;
  }
  
  function toggleDarkMode() {
    let map = document.getElementById('map');
    darkMode = !darkMode;
    darkModeStore.set(darkMode);
    if (map && get(mapTypeStore) !== 'satellite') {
      map.classList.add('dark');
    } else {
      if (map) map.classList.remove('dark');
    }
    if (darkMode) {
      if (map && get(mapTypeStore) !== 'satellite') {
        map.classList.add('dark');
      }
      // @ts-ignore
      document.querySelector('.bg')!.style.background = "url('bg-map.webp') no-repeat center center fixed";
      primaryColorStore.set('#1c1c1e');
      secondaryColorStore.set('#121212');
      tertiaryColorStore.set('#2d2d2d');
    } else {
      if (map && get(mapTypeStore) !== 'satellite') {
        map.classList.remove('dark');
      }
      // @ts-ignore
      document.querySelector('.bg')!.style.background = "url('bg-map-light.webp') no-repeat center center fixed";
      primaryColorStore.set('#ffffff');
      secondaryColorStore.set('#e7e9ef');
      tertiaryColorStore.set('#d7d7d7');
    }
  }
</script>

<main class="bg-black flex overflow-auto"
  style="--heightOfDashboard: {heightOfDashboard}px; --primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <div class="bg fixed w-full h-full "></div>
  <div class="dark-mode-btn absolute top-2 left-2 z-20">
    <button class="nav-button" aria-label="Toggle Dark Mode" on:click={toggleDarkMode}>
      <i class="nav-icon fas {darkMode ? 'fa-sun' : 'fa-moon'}"></i>
    </button>
  </div>
  <div class="bg-[#0000001f] flex w-full h-full z-10">
    <!-- Desktop Navigation -->
    <nav class="desktop-nav w-min h-full p-4 grid opacity-0 z-20"
      class:opacity={!isNavHidden ? 1 : 0}
    >
        <div class="flex-grow flex flex-col items-center">
          <div class="mb-5">
            <button on:click|preventDefault={() => handleNavigation('/')}>
              <img src="/logo.png" alt="Logo" class="w-12 h-12">
            </button>
            </div>
            {#if $authData}
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
            <div class="separator h-[2px] w-[80%] rounded-2xl mb-4"></div>
            <a href={`http://${window.location.hostname}:8090/_/`} target="_blank" class="nav-button mb-4">
              <i class="nav-icon fas fa-user"></i>
              <div class="tooltip text-white">Admin Dashboard</div>
            </a>
            <a href="/login" on:click|preventDefault={handleLogout} class="nav-button mb-4">
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
            <a class="nav-button" aria-label="GitHub" href="https://github.com/MAV-Manager/mmgcs" target="_blank">
            <i class="nav-icon fab fa-github"></i>
            <div class="tooltip text-white">GitHub</div>
            </a>
            <div class="separator h-[2px] w-[80%] mx-auto mb-2 rounded-2xl"></div>
            <a class="nav-button" aria-label="FAA Rules" href="https://www.faa.gov/uas" target="_blank">
            <i class="nav-icon fas fa-plane-circle-exclamation"></i>
            <div class="tooltip text-white">FAA Rules and Regulations for Unmanned Aircraft Systems (UAS)</div>
            </a>
          </div>
    </nav>

    <!-- Mobile Navigation -->
    <nav
      class="mobile-nav p-4 md:hidden flex flex-col z-20"
      style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
    >
      <div class="flex justify-between items-center">
        <button class="nav-button" aria-label="Toggle Navigation" on:click={toggleNav}>
          <i class="nav-icon fas fa-bars"></i>
        </button>
        <span class="text-xl font-semibold">MAV Manager GCS</span>
        <a href="/" on:click|preventDefault={() => handleNavigation('/')}>
          <img src="/logo.png" alt="Logo" class="w-8 h-8">
        </a>
      </div>
      <div class={`mobile-nav-links ${isNavOpen ? 'block' : 'hidden'} flex flex-col items-center mt-4`}>
        {#if $authData}
          <a href="/dashboard" on:click|preventDefault={() => handleNavigation('/dashboard')} class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
            <i class="nav-icon fas fa-tachometer-alt"></i>&nbsp;&nbsp;Dashboard
          </a>
          <a href="/mission-planner" on:click|preventDefault={() => handleNavigation('/mission-planner')} class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
            <i class="nav-icon fas fa-route"></i>&nbsp;&nbsp;Mission Planner
          </a>
          <a href="/event-log" on:click|preventDefault={() => handleNavigation('/event-log')} class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
            <i class="nav-icon fas fa-bars-staggered"></i>&nbsp;&nbsp;Event Log
          </a>
          <a href="/user-settings" on:click|preventDefault={() => handleNavigation('/parameters')} class="nav-button mb-4 {currentPath === '/parameters' ? 'active' : ''}">
            <i class="nav-icon fas fa-cog"></i>&nbsp;&nbsp;Vehicle Parameters
          </a>
          <a href="/admin" on:click|preventDefault={() => handleNavigation('/admin')} class="nav-button mb-4">
            <i class="nav-icon fas fa-user"></i>&nbsp;&nbsp;Admin Dashboard
          </a>
          <button on:click|preventDefault={handleLogout} class="nav-button mb-4" type="button">
            <i class="nav-icon fas fa-sign-out-alt"></i>&nbsp;&nbsp;Logout
          </button>
        {:else}
          <a href="/login" on:click|preventDefault={() => handleNavigation('/login')} class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
            <i class="nav-icon fas fa-sign-in-alt"></i>&nbsp;&nbsp;Login
          </a>
        {/if}
      </div>
    </nav>

    <div class="slot-container flex-grow { currentPath !== '/login' && currentPath !== '/' ? 'pr-8' : '' } justify-center items-center overflow-auto z-10">
      <slot />
    </div>

    {#key online}
      {#if !online && currentPath !== '/login' && currentPath !== '/'}
        <Offline />
      {/if}
    {/key}
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
