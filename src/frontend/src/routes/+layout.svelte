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
    mavHeadingStore,
    mavLocationStore,
    mavlinkLogStore,
    mavAltitudeStore,
    mavSpeedStore,
    mavModelStore,
    mavTypeStore,
    mavStateStore,
    mavModeStore,
    mavBatteryStore,
    mavArmedStateStore
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
  import Modal from '../components/Modal.svelte';
  import Notification from '../components/Notification.svelte';

  let pb: PocketBase;

  let currentPath = '';
  let heightOfDashboard = 1000;
  let logs: string[] = [];

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';
  $: currentPath = $page.url.pathname;
  $: isNavHidden = currentPath === '/' || currentPath === '/login';
  $: missionCountStore.set(Object.keys($missionPlanActionsStore).length - 1);
  $: actions = $missionPlanActionsStore;

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
      const response = await fetch('/api/mavlink/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        Object.keys(data).forEach(key => {
          updateBlackBoxCollection(JSON.stringify(data[key]));
        });
        data.forEach((log: string) => {
          getLogs(log.replace(/\\"/g, '"') + '\n');
        });
      } else {
        let notification = new Notification({
          target: document.body,
          props: {
            title: 'Offline',
            content: 'The MAVLink stream is offline.',
            type: 'error'
          }
        });
        setTimeout(() => notification.$destroy(), 5000);
      }
  } catch (error: any) {
      let notification = new Notification({
        target: document.body,
        props: {
          title: 'Error',
          content: `Error: ${error.message || error}`,
          type: 'error'
        }
      });
      setTimeout(() => notification.$destroy(), 5000);
      return;
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

  async function updateBlackBoxCollection(log: string) {
    try {
      // Add new logs to the collection
      await pb.collection('blackbox').create({ log: log });
    } catch (error : any) {
      if (error.message.includes('The request was autocancelled')) {
          // ignore it
      } else {
          console.error('Error:', error.message || error);
          console.error('Stack Trace:', error.stack || 'No stack trace available');
      }
    }
  }

  async function cleanupBlackBoxCollection() {
    try {
      let records = await pb.collection('blackbox').getFullList();
      if (records.length > 1000) {
        // Sort records by creation date (or timestamp) to find the oldest ones
        records.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

        // Keep the latest 1,000 records
        let recordsToDelete = records.slice(0, records.length - 1000);

        // Delete the selected records
        let deletePromises = recordsToDelete.map(record => pb.collection('blackbox').delete(record.id));
        Promise.all(deletePromises);
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

  async function getLogs(text: string) {
    // truncate old logs to save memory
    logs = logs.slice(-1000);

    if (text && !logs.includes(text)) {
      logs = [...logs, text];
      mavlinkLogStore.set(logs);

      if ((text as string).includes('GLOBAL_POSITION_INT')) {
        let lat: string | RegExpMatchArray | null = (text as string).match(/"lat":\-?(\d+)/g);
        let lon: string | RegExpMatchArray | null = (text as string).match(/"lon":\-?(\d+)/g);
        if (lat) lat = lat.toString().replace('"lat":', '');
        if (lon) lon = lon.toString().replace('"lon":', '');
        if (lat && lon) mavLocationStore.set({ lat: parseFloat(lat)/1e7, lng: parseFloat(lon)/1e7 });
        let heading: string | RegExpMatchArray | null = (text as string).match(/"hdg":(\d+)/g);
        if (heading) heading = heading.toString().replace('"hdg":', '');
        if (heading) mavHeadingStore.set(parseFloat(heading)/100);
        let altitude: string | RegExpMatchArray | null = (text as string).match(/"alt":(\d+)/g);
        if (altitude) altitude = altitude.toString().replace('"alt":', '');
        if (altitude) mavAltitudeStore.set(parseFloat(altitude)/1000);
        let vx: number | string | RegExpMatchArray | null = parseInt((text as string).match(/"vx":(\-?\d+)/g)!.toString().replace('"vx":', '')) / 100;
        let vy: number | string | RegExpMatchArray | null = parseInt((text as string).match(/"vy":(\-?\d+)/g)!.toString().replace('"vy":', '')) / 100;
        let vz: number | string | RegExpMatchArray | null = parseInt((text as string).match(/"vz":(\-?\d+)/g)!.toString().replace('"vz":', '')) / 100;
        let speed: number = Math.sqrt(Math.pow(vx, 2) + Math.pow(vy, 2) + Math.pow(vz, 2));
        if (speed) mavSpeedStore.set(parseFloat(speed.toFixed(2)));
      } else if ((text as string).includes('HEARTBEAT')) {
        let type: string | RegExpMatchArray | null = (text as string).match(/"type":(\d+)/g);
        // @ts-ignore
        if (type) type = MavType[parseInt(type.toString().replace('"type":', ''))].toProperCase();
        if (type) mavTypeStore.set(type as string);
        let model: string | RegExpMatchArray | null = (text as string).match(/"autopilot":(\d+)/g);
        if (model) model = model.toString().replace('"autopilot":', '');
        if (model) mavModelStore.set(MavAutopilot[parseInt(model)]);
        let state: string | RegExpMatchArray | null = (text as string).match(/"systemStatus":(\d+)/g);
        if (state) state = MavState[parseInt(state.toString().replace('"systemStatus":', ''))];
        if (state) mavStateStore.set(state as string);
        let baseMode: string | RegExpMatchArray | null = (text as string).match(/"baseMode":(\d+)/g);
        let customMode: string | RegExpMatchArray | null = (text as string).match(/"customMode":(\d+)/g);
        if (baseMode) {
          baseMode = baseMode.toString().replace('"baseMode":', '');
          mavArmedStateStore.set(parseInt(baseMode) === 209);
        }
        if (customMode) {
          customMode = customMode.toString().replace('"customMode":', '');
          mavModeStore.set(CopterMode[parseInt(customMode)]);
        }
      } else if ((text as string).includes('MISSION_CURRENT')) {
        let index: string | RegExpMatchArray | null = (text as string).match(/"seq":(\d+)/g);
        if (index) index = index.toString().replace('"seq":', '');
        if (index) missionIndexStore.set(parseInt(index));
      } else if ((text as string).includes('MISSION_ITEM_REACHED')) {
        let index: string | RegExpMatchArray | null = (text as string).match(/"seq":(\d+)/g);
        if (index) index = index.toString().replace('"seq":', '');
        if (index && parseInt(index) === Object.keys($missionPlanActionsStore).length - 1)
          missionCompleteStore.set(true);
        if (index) {
          const notification = new Notification({
            target: document.body,
            props: {
              title: 'Waypoint Reached',
              content: `${index}: ${actions[parseInt(index)].type}<br>lat: ${actions[parseInt(index)].lat} °<br>lng: ${actions[parseInt(index)].lon} °<br>alt: ${actions[parseInt(index)].alt === null ? 0 : actions[parseInt(index)].alt} m`,
              type: 'success'
            }
          });
          setTimeout(() => notification.$destroy(), 10000);
        }
      } else if ((text as string).includes('SYS_STATUS')) {
        let battery: string | RegExpMatchArray | null = (text as string).match(/"batteryRemaining":(\d+)/g);
        if (battery) battery = battery.toString().replace('"batteryRemaining":', '');
        if (battery) mavBatteryStore.set(parseInt(battery));
      } else if ((text as string).includes('COMMAND_ACK')) {
        let command: string | RegExpMatchArray | null = (text as string).match(/"command":(\d+)/g);
        let result: string | RegExpMatchArray | null = (text as string).match(/"result":(\d+)/g);
        if (command && result) {
          command = MavCmd[parseInt(command.toString().replace('"command":', ''))];
          result = MavResult[parseInt(result.toString().replace('"result":', ''))];
          let type = result === 'ACCEPTED' ? 'success' : 'warning';
          if (result.includes('FAILED') || result.includes('DENIED') || result.includes('UNSUPPORTED')) type = 'error';
          if (command !== 'REQUEST_MESSAGE') {
            const notification = new Notification({
              target: document.body,
              props: {
                title: 'Command Acknowledged',
                content: `Command: ${command}<br>Result: ${result}`,
                type: type
              }
            });
            setTimeout(() => notification.$destroy(), 10000);
          }
        }
      }
    }
  }

  onMount(async () => {
    pb = new PocketBase(`http://${window.location.hostname}:8090`);
    
    await initializeMissionPlansCollection();
    await initializeBlackBoxCollection();

    setInterval(async () => {
      if (typeof window !== 'undefined' && authData.checkExpired() && window.location.pathname !== '/') {
        authData.set(null);
        goto('/login');
      }
      await cleanupBlackBoxCollection();
      await checkOnlineStatus();
    }, 1100);

    await checkLoadedMission();
    
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

  async function initializeBlackBoxCollection() {
    try {
      const collections = await pb.collections.getFullList();
      const collectionExists = collections.some(c => c.name === 'blackbox');
      
      if (!collectionExists) {
        const newCollection = {
          name: 'blackbox',
          type: 'base',
          schema: [
            { name: 'log', type: 'text', options: { maxSize: 100000000 } }
          ]
        };
        await pb.collections.create(newCollection);
        console.log('Collection "blackbox" created successfully.');
      }
    } catch (error: any) {
      if (error.message.includes('The request was autocancelled')) {
        // ignore it
      } else {
        console.error('Error:', error);
      }
    }
  }

  function handleNavigation(path: string) {
    if (currentPath !== path) {
      goto(path);
    }
  }

  function handleLogout() {
    authData.set(null);
    goto('/login');
  }

  let isNavOpen = false;
  function toggleNav() {
    isNavOpen = !isNavOpen;
  }
</script>

<main class="bg-black flex overflow-auto">
  <div class="bg fixed w-full h-full "></div>
  <div class="bg-[#0000001f] flex w-full h-full z-10">
    <!-- Desktop Navigation -->
    <nav class="desktop-nav w-min h-full p-4 grid opacity-0 z-20"
      style="--heightOfDashboard: {heightOfDashboard}px; --primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
      class:opacity={!isNavHidden ? 1 : 0}
    >
        <div class="flex-grow flex flex-col items-center">
          <div class="mb-5">
            <button on:click|preventDefault={() => handleNavigation('/')}>
              <img src="/logo.png" alt="Logo" class="w-12 h-12">
            </button>
          </div>
          {#if $authData}
            <button on:click|preventDefault={() => handleNavigation('/dashboard')} class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
              <i class="nav-icon fas fa-tachometer-alt"></i>
              <div class="tooltip text-white">Dashboard</div>
            </button>
            <button on:click|preventDefault={() => handleNavigation('/mission-planner')} class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
              <i class="nav-icon fas fa-route"></i>
              <div class="tooltip text-white">Mission Planner</div>
            </button>
            <button on:click|preventDefault={() => handleNavigation('/event-log')} class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
              <i class="nav-icon fas fa-bars-staggered"></i>
              <div class="tooltip text-white">Event Log</div>
            </button>
            <div class="separator h-[2px] w-[80%] rounded-2xl mb-4"></div>
            <button on:click|preventDefault={() => handleNavigation('/user-settings')} class="nav-button mb-4 {currentPath === '/user-settings' ? 'active' : ''}">
              <i class="nav-icon fas fa-user"></i>
              <div class="tooltip text-white">User Settings</div>
            </button>
            <button on:click|preventDefault={() => handleNavigation('/notifications')} class="nav-button mb-4 {currentPath === '/notifications' ? 'active' : ''}">
              <i class="nav-icon fas fa-bell"></i>
              <div class="tooltip text-white">Notifications</div>
            </button>
            <button on:click={handleLogout} class="nav-button mb-4">
              <i class="nav-icon fas fa-sign-out-alt"></i>
              <div class="tooltip text-white">Logout</div>
            </button>
          {:else}
            <button on:click|preventDefault={() => handleNavigation('/login')} class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
              <i class="nav-icon fas fa-sign-in-alt"></i>
              <div class="tooltip text-white">Login</div>
            </button>
          {/if}
        </div>
        <div class="flex flex-col justify-self-end gap-3">
          <button class="nav-button" aria-label="GitHub" on:click|preventDefault={() => window.open('https://github.com/MAV-Manager/mmgcs', '_blank')}>
            <i class="nav-icon fab fa-github"></i>
            <div class="tooltip text-white">GitHub</div>
          </button>
          <div class="separator h-[2px] w-[80%] mx-auto mb-2 rounded-2xl"></div>
          <button class="nav-button" aria-label="FAA Rules" on:click|preventDefault={() => window.open('https://www.faa.gov/uas', '_blank')}>
            <i class="nav-icon fas fa-plane-circle-exclamation"></i>
            <div class="tooltip text-white">FAA Rules and Regulations for Unmanned Aircraft Systems (UAS)</div>
          </button>
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
          <a href="/user-settings" on:click|preventDefault={() => handleNavigation('/user-settings')} class="nav-button mb-4 {currentPath === '/user-settings' ? 'active' : ''}">
            <i class="nav-icon fas fa-user"></i>&nbsp;&nbsp;User Settings
          </a>
          <a href="/notifications" on:click|preventDefault={() => handleNavigation('/notifications')} class="nav-button mb-4 {currentPath === '/notifications' ? 'active' : ''}">
            <i class="nav-icon fas fa-bell"></i>&nbsp;&nbsp;Notifications
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

    <div class="slot-container flex-grow pr-8 justify-center items-center overflow-auto z-10">
      <slot />
    </div>
  </div>
</main>

<style>
  .bg {
    background: url('bg-map.webp') no-repeat center center fixed;
    background-size: cover !important;
    margin: 0;
    filter: blur(2px);
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
