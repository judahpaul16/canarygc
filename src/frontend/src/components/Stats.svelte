<script lang="ts">
  import {
    missionPlanTitleStore,
    missionCountStore,
    missionIndexStore,
    missionCompleteStore
  } from '../stores/missionPlanStore';
  import {
    mavModelStore,
    mavTypeStore,
    mavStateStore,
    mavModeStore,
    mavAltitudeStore,
    mavSpeedStore,
    mavBatteryStore,
    mavArmedStateStore,
    mavLocationStore,
    mavlinkParamStore
  } from '../stores/mavlinkStore';
  import { darkModeStore, primaryColorStore, secondaryColorStore, tertiaryColorStore } from '../stores/customizationStore';
  import { markersStore } from '../stores/mapStore';
  import { get } from 'svelte/store';

  import Modal from './Modal.svelte';
  import Notification from './Notification.svelte';
  import type { LatLng } from 'leaflet';

  export let mavModel: string = get(mavModelStore);
  export let mavType: string = get(mavTypeStore);
  export let isArmed: boolean = get(mavArmedStateStore)
  export let speed: number = get(mavSpeedStore);
  export let altitude: number = get(mavAltitudeStore);
  export let systemState: string = get(mavStateStore);
  export let batteryStatus: number | null = get(mavBatteryStore);
  export let mavMode: string = get(mavModeStore);

  let markers = get(markersStore);
  let progressSamples: { progress: number, timestamp: number }[] = [];

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = darkMode ? $tertiaryColorStore : $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';
  $: mavModel = $mavModelStore;
  $: mavType = $mavTypeStore;
  $: isArmed = $mavArmedStateStore;
  $: systemState = $mavStateStore;
  $: mavMode = $mavModeStore;
  $: batteryStatus = $mavBatteryStore;
  $: altitude = $mavAltitudeStore;
  $: speed = $mavSpeedStore;
  $: missionPlanTitle = $missionPlanTitleStore;
  $: mavLocation = $mavLocationStore;
  $: missionProgress = getMissionProgress($missionIndexStore, $missionCountStore, $mavLocationStore as L.LatLng);
  $: missionLoaded = $missionPlanTitleStore !== '';
  $: markers = $markersStore;
  $: eta = calculateETA(missionProgress, $mavLocationStore);

  function getMissionProgress(index: number, count: number, mavLocation: L.LatLng): number {
    let progress: number = 0;
    let nextMarkerLocation: L.LatLng = { lat: 0, lng: 0 } as L.LatLng;
    let prevMarkerLocation: L.LatLng = { lat: 0, lng: 0 } as L.LatLng;
    if (markers.get(index) !== undefined) nextMarkerLocation = markers.get(index)!.getLatLng();
    if (markers.get(index - 1) !== undefined) prevMarkerLocation = markers.get(index - 1)!.getLatLng();
    if (nextMarkerLocation.lat !== 0 && nextMarkerLocation.lng !== 0 && prevMarkerLocation.lat !== 0 && prevMarkerLocation.lng !== 0) {
      let distanceToNext = haversine(mavLocation.lat, mavLocation.lng, nextMarkerLocation.lat, nextMarkerLocation.lng);
      let distanceToPrev = haversine(mavLocation.lat, mavLocation.lng, prevMarkerLocation.lat, prevMarkerLocation.lng);
      let totalDistance = distanceToNext + distanceToPrev;
      progress = (distanceToPrev / totalDistance);
    }
    let section = ((1 / count) * 100) * (index - 1);
    progress = progress * ((1 / count) * 100);
    progress = parseFloat((Math.min(section + progress, 100)).toFixed(2));
    addSample(progress, Date.now());
    return progress;
  }

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    // distance between latitudes
    // and longitudes
    let dLat = (lat2 - lat1) * Math.PI / 180.0;
    let dLon = (lon2 - lon1) * Math.PI / 180.0;
        
    // convert to radians
    lat1 = (lat1) * Math.PI / 180.0;
    lat2 = (lat2) * Math.PI / 180.0;
      
    // apply formulae
    let a = Math.pow(Math.sin(dLat / 2), 2) + 
                Math.pow(Math.sin(dLon / 2), 2) * 
                Math.cos(lat1) * 
                Math.cos(lat2);
    let rad = 6371;
    let c = 2 * Math.asin(Math.sqrt(a));
    return rad * c;
  }

  function addSample(progress: number, timestamp: number) {
    progressSamples.push({ progress, timestamp });
    
    // Keep only the latest 2 samples
    if (progressSamples.length > 2) {
      progressSamples.shift();
    }
  }

  function calculateETA(currentProgress: number, location: LatLng | { lat: number; lng: number; }): string {
    if (progressSamples.length < 2) {
      return "00:00:00"; // Not enough samples
    }
    
    // Get the last two samples
    const [{ progress: progress1, timestamp: time1 }, { progress: progress2, timestamp: time2 }] = progressSamples;

    // Calculate the progress rate (progress per second)
    let progressRate = (progress2 - progress1) / ((time2 - time1) / 1000);

    if (progressRate < 0) {
      progressRate = 1; // Avoid division by zero
    }
    
    // Calculate the remaining progress to reach 100%
    const remainingProgress = 100 - currentProgress;

    // Calculate the remaining time in seconds
    const remainingTimeSeconds = (remainingProgress / progressRate);

    // Convert remaining time to hours, minutes, and seconds
    const hours = Math.floor(remainingTimeSeconds / 3600);
    const minutes = Math.floor((remainingTimeSeconds % 3600) / 60);
    const seconds = Math.floor(remainingTimeSeconds % 60);

    // Format the time as HH:MM:SS
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
      return "00:00:00";
    }
    
    const formattedTime = [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0')
    ].join(':');

    return formattedTime;
  }

  async function sendMavlinkCommand(command: string, params: string  = '', useCmdLong: string = 'false', useArduPilotMega: string = 'false') {
    const response = await fetch(`/api/mavlink/send_command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'command': command,
        'params': params,
        'useCmdLong': useCmdLong,
        'useArduPilotMega': useArduPilotMega
      },
    });
    if (response.ok) {
      console.log(await response.text());
    } else {
      console.error(`Error: ${await response.text()}`);
    }
  }
  
  function encodeParameterValue(value: number, paramType: number): number {
    // Ensure the value is within valid range for the type
    switch (paramType) {
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
        console.warn('Unknown parameter type:', paramType);
        return value;
      }
    }

    async function writeParameter(id: string, value: number, type: number) {
      try {
        const encodedValue = encodeParameterValue(value, type);
        
        // Remove any extra quotes from the parameter ID
        const cleanId = id.replace(/^"|"$/g, '');
        
        console.log('Writing parameter:', {
          id: cleanId,
          originalValue: value,
          encodedValue,
          type
        });
        
        const response = await fetch('/api/mavlink/write_param', {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'id': cleanId,
            'value': encodedValue.toString(),
            'type': type.toString(),
          },
        });

        if (!response.ok) throw new Error(await response.text());
      } catch (err: any) {
        console.error('Failed to write parameter:', err.message);
      }
    }

  function confirmCalibration() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Sensor Calibration',
        content: 'Are you sure you want to calibrate the sensors? If so please manually specify the current heading (direction) of the MAV in degrees.',
        inputs: [
          {
            type: 'number',
            placeholder: 'Current Heading',
            required: true,
          }
        ],
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('FIXED_MAG_CAL_YAW', `${[isNaN(parseInt(modal.inputValues![0])) ? 0 : modal.inputValues![0], 0, mavLocation.lat, mavLocation.lng]}`);
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          await sendMavlinkCommand('PREFLIGHT_CALIBRATION', `${[0, 0, 0, 0, 4, 0, 0, 0]}`);
          modal.$destroy();
        }
      }
    });
  }

  function stopMission() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Stop Mission',
        content: 'Are you sure you want to stop the mission?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE', `${[1, 6]}`, 'true'); // 6 is RTL: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          modal.$destroy();
          const notification = new Notification({
            target: document.body,
            props: {
              title: 'Mission Stopped',
              content: 'The mission has been stopped.<br>Returning to launch.',
              type: 'info',
            }
          });
          setTimeout(() => notification.$destroy(), 10000);
        },
      }
    });
  }

  function pauseMission() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Pause Mission',
        content: 'Are you sure you want to pause the mission?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`, 'true'); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          modal.$destroy();
          const notification = new Notification({
            target: document.body,
            props: {
              title: 'Mission Paused',
              content: 'The mission has been paused.',
              type: 'info',
            }
          });
          setTimeout(() => notification.$destroy(), 10000);
        },
      }
    });
  }

  async function startMission() {
    let encodedValue = encodeParameterValue(get(mavlinkParamStore).RTL_ALT.param_value, get(mavlinkParamStore).RTL_ALT.param_type);
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Start / Resume Mission',
        content: 'Are you sure you want to start the mission? Please specify RTL_ALT (Return to Launch Altitude) in CENTIMETERS. Make sure to consider any potential obstacles between the RTL waypoint and the launch location.',
        isOpen: true,
        confirmation: true,
        notification: false,
        inputs: [
          {
            type: 'number',
            placeholder: `RTL_ALT: ${encodedValue} cm`,
            required: true,
          }
        ],
        onConfirm: async () => {
          missionIndexStore.set(1);
          missionCompleteStore.set(false);
          await writeParameter('RTL_ALT', parseInt(modal.inputValues![0]), get(mavlinkParamStore).RTL_ALT.param_type);
          await writeParameter('RTL_CLIMB_MIN', 0, get(mavlinkParamStore).RTL_CLIMB_MIN.param_type);
          if (get(mavStateStore) === 'STANDBY') {
            await sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`, 'true'); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
            await sendMavlinkCommand('COMPONENT_ARM_DISARM', `${[1, 0]}`, 'true'); // param2: 21196 bypasses pre-arm checks
            await sendMavlinkCommand('NAV_TAKEOFF', `${[0, 0, 0, 0, 0, 0, 10]}`, 'true');
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          }
          await sendMavlinkCommand('DO_SET_MODE', `${[1, 3]}`, 'true'); // 3 is AUTO Mode: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          modal.$destroy();
          const notification = new Notification({
            target: document.body,
            props: {
              title: 'Mission Started',
              content: 'The mission has been started.',
              type: 'info',
            }
          });
          setTimeout(() => notification.$destroy(), 10000);
        },
      }
    });
  }

  function releasePayload() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Confirm Release Payload',
        content: 'Are you sure you want to release the payload?\nUse caution and ensure the drop zone is clear.',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          if (mavMode !== 'GUIDED') await sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`, 'true'); // param2: 4 (GUIDED) see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          await sendMavlinkCommand('DO_SET_SERVO' , `${[9, 1050]}`); // param2 - 1900: release, 1100: grip
          await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 0.5 seconds
          await sendMavlinkCommand('DO_SET_SERVO' , `${[9, 1950]}`); // param2 - 1900: release, 1100: grip
          modal.$destroy();
        },
      }
    });
  }

  function initTakeoff() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Confirm Takeoff',
        content: 'Are you sure you want to initiate takeoff? If so please specify the altitude.',
        isOpen: true,
        confirmation: true,
        notification: false,
        inputs: [
          {
            type: 'number',
            placeholder: 'Altitude (m)',
            required: true,
          }
        ],
        onConfirm: async () => {
          if (mavMode !== 'GUIDED') await sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`, 'true'); // param2: 4 (GUIDED) see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          await sendMavlinkCommand('COMPONENT_ARM_DISARM', `${[1, 0]}`, 'true'); // param2: 21196 bypasses pre-arm checks
          await sendMavlinkCommand('NAV_TAKEOFF', `${[0, 0, 0, 0, 0, 0, parseInt(modal.inputValues![0])]}`, 'true');
        },
      }
    });
  }
  
  function initLanding() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Confirm Landing',
        content: 'Are you sure you want to land the MAV?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`, 'true'); // param2: 4 (GUIDED) see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          await sendMavlinkCommand('NAV_LAND', `${[0, 0, 0, 0, mavLocation.lat, mavLocation.lng, 0]}`, 'true');
        },
      }
    });
  }
  
  function checkMode(target: string, mode: string) {
    return target.includes(mode);
  }
</script>

<div
  class="stats p-4 rounded-2xl flex flex-col space-y-2 h-full overflow-y-auto overflow-x-hidden text-sm"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <h2 class="text-lg font-bold">
    <a href="https://mavlink.io/en/messages/common.html#MAV_AUTOPILOT" target="_blank" title="More Information">
      <i class="fas fa-info-circle text-gray-500 hover:text-[#62bbff] mr-[0.2em]"></i>
    </a>
    <span class="text-gray-500">Autopilot Model:</span>&nbsp;{mavModel}
  </h2>
  <hr />
  <div class="h-full flex flex-col justify-evenly">
    <div class="grid grid-cols-2 gap-2">
      <div>MAV Type: {mavType}</div>
      <div>System State: {systemState}</div>
      <div>Speed: {speed} m/s</div>
      <div>Altitude: {altitude} m</div>
      <div class="battery-status {batteryStatus === null ? 'red' : ''} {batteryStatus !== null && batteryStatus < 20 ? 'red' : batteryStatus !== null && batteryStatus < 50 ? 'yellow' : 'green'}">Battery Status: {batteryStatus !== null ? batteryStatus : '--'}%</div>
      <div>Mode: <span  class="text-orange-400">{mavMode}</span></div>
    </div>
    <hr class="my-3" />
      <div class="w-full mb-2">Loaded Mission Plan:
        <span class="text-[#66e1ff] {darkMode ? '' : 'brightness-90'}" title={missionPlanTitle}>
          {missionPlanTitle || 'No mission plan loaded.'}
        </span>
      </div>
      <div class="flex flex-col items-center justify-end">
        <div class="w-full">
          <span>Mission Progress: {systemState === 'Unknown' ? '--' : mavMode === 'AUTO' ? missionProgress : 0}% (ETA {eta})</span>
          <div class="progress-bar rounded-full h-2.5 mt-3">
            <div class="progress-bar-inner h-2.5 rounded-full" style="width: {mavMode === 'AUTO' ? missionProgress : 0}%;"></div>
          </div>
        </div>
        <div class="button-container mt-6">
          <div class="relative group">
            <button class="circular-button" on:click={confirmCalibration}>
              <i class="far fa-compass text-[#ffa704] fa-spin"></i>
              <div class="tooltip text-white">Calibrate Sensors</div>
            </button>
          </div>
          <div class="relative group">
            <button class="circular-button" on:click={releasePayload}>
              <i class="fas fa-parachute-box"></i>
              <div class="tooltip text-white">Release Payload</div>
            </button>
          </div>
          {#if systemState === 'STANDBY'}
            <div class="relative group flex flex-col items-center">
              <button class="circular-button" on:click={initTakeoff} disabled={checkMode('AUTO', mavMode)}>
                <i class="fas fa-plane-departure"></i>
                <div class="tooltip text-white">Initiate Takeoff</div>
              </button>
            </div>
          {:else}
            <div class="relative group flex flex-col items-center">
              <button class="circular-button" on:click={initLanding} disabled={checkMode('AUTO', mavMode) || checkMode('LAND', mavMode)}>
                <i class="fas fa-plane-arrival"></i>
                <div class="tooltip text-white">Initiate Landing</div>
              </button>
            </div>
          {/if}
          {#if !checkMode('AUTO', mavMode) || systemState === 'STANDBY'}
            <div class="relative group">
              <button
                class="circular-button" on:click={startMission}
                disabled={checkMode('AUTO', mavMode) && systemState !== 'STANDBY' || !missionLoaded}
              >
                <i class="fas fa-play"></i>
                <div class="tooltip text-white">Start/Resume Mission</div>
              </button>
            </div>
          {:else}
            <div class="relative group">
              <button
                class="circular-button" on:click={pauseMission}
                disabled={!checkMode('AUTO', mavMode) || !missionLoaded}
              >
                <i class="fas fa-pause"></i>
                <div class="tooltip text-white">Pause Mission (Loiter)</div>
              </button>
            </div>
          {/if}
          <div class="relative group">
            <button
              class="circular-button" on:click={stopMission}
              disabled={!checkMode('AUTO', mavMode) || !missionLoaded}
            >
              <i class="fas fa-stop text-red-400"></i>
              <div class="tooltip text-white">Stop Mission (RTL)</div>
            </button>
          </div>
        </div>
      </div>
  </div>
</div>

<style>
  .stats {
    background-color: var(--primaryColor);
    color: var(--fontColor);
  }

  hr {
    border: 1px solid var(--secondaryColor);
  }

  .progress-bar {
    background-color: var(--tertiaryColor);
  }

  .progress-bar-inner {
    background: linear-gradient(45deg, #4c75af 25%, transparent 25%, transparent 50%, #66e1ff 50%, #66e1ff 75%, transparent 75%, transparent);
    background-size: 30px 30px;
    animation: progress-bar 1s linear infinite;
    transition: width 0.3s;
  }

  @keyframes progress-bar {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 30px 0;
    }
  }

  .battery-status {
    color: var(--fontColor);
  }
  .battery-status.green {
    color: green;
  }
  .battery-status.yellow {
    color: #e7b908;
  }
  .battery-status.red {
    color: red;
  }

  .button-container {
    display: inline-flex;
    justify-content: center;
    width: 100%;
    margin-top: 1.5rem;
  }

  .circular-button {
    width: 3rem;
    height: 3rem;
    margin-inline: 0.6em;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--tertiaryColor);
    color: white;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.3s;
    position: relative;
  }

  .circular-button:hover {
    filter: brightness(1.1);
  }

  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
  }

  .circular-button:hover .tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(-0.5rem);
  }

  button:disabled, button:disabled:hover {
    background-color: #b5bcc5;
    filter: brightness(0.7);
    cursor: not-allowed;
  }
</style>
