<script lang="ts">
  import { goto } from '$app/navigation';
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
    fcProtocolStore,
    fcFirmwareStore
  } from '../stores/mavlinkStore';
  import { darkModeStore } from '../stores/customizationStore';
  import { markersStore } from '../stores/mapStore';
  import { get } from 'svelte/store';

  import { showModal, notify } from '../lib/overlays';
  import { sendMavlinkCommand, setFlightMode } from '../lib/mavlink-client';
  import { isAutoLabel, isGuidedLabel, isPX4 } from '../lib/flight-modes';
  import { startMissionWithConfirm } from '../lib/start-mission';
  import { takeoffWithConfirm, landWithConfirm } from '../lib/takeoff-land';
  import { missionPlanActionsStore } from '../stores/missionPlanStore';
  import {
    startGuidanceWithConfirm,
    stopGuidance,
    startInavMissionWithConfirm,
    stopInavMission
  } from '../lib/guidance-session';
  import type { LatLng } from 'leaflet';

  const GRIPPER_SERVO_CHANNEL = 9;
  const GRIPPER_OPEN_PWM_US = 1050;
  const GRIPPER_CLOSE_PWM_US = 1950;
  const GRIPPER_CYCLE_DELAY_MS = 500;
  const CALIBRATION_SETTLE_DELAY_MS = 5000;

  interface Props {
    mavModel?: string;
    mavType?: string;
    isArmed?: boolean;
    speed?: number;
    altitude?: number;
    systemState?: string;
    batteryStatus?: number | null;
    mavMode?: string;
  }

  let {
    mavModel = $bindable(get(mavModelStore)),
    mavType = $bindable(get(mavTypeStore)),
    isArmed = $bindable(get(mavArmedStateStore)),
    speed = $bindable(get(mavSpeedStore)),
    altitude = $bindable(get(mavAltitudeStore)),
    systemState = $bindable(get(mavStateStore)),
    batteryStatus = $bindable(get(mavBatteryStore)),
    mavMode = $bindable(get(mavModeStore))
  }: Props = $props();

  let markers = $derived($markersStore);
  let progressSamples: { progress: number, timestamp: number }[] = [];


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
    if (systemState === 'STANDBY') progress = 0;
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

  function calculateETA(currentProgress: number): string {
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

  function calculateRemainingDistance(index: number, mavLocation: LatLng | { lat: number; lng: number }, markers: Map<number, L.Marker>): number {
    let totalDistance = 0;
    
    // Calculate total distance from current position to end through remaining waypoints
    let currentPos = mavLocation;
    for (let i = index; i <= markers.size; i++) {
        const nextMarker = markers.get(i);
        if (nextMarker) {
            const nextPos = nextMarker.getLatLng();
            totalDistance += haversine(currentPos.lat, currentPos.lng, nextPos.lat, nextPos.lng);
            currentPos = nextPos;
        }
    }
    
    return parseFloat((totalDistance * 1000).toFixed(2)); // Returns distance in meters
  }

  function confirmCalibration() {
    if (isPX4()) {
      notify({
        title: 'Not available on PX4',
        content: 'Yaw-referenced compass calibration uses an ArduPilot command. Calibrate PX4 sensors from the Sensor Calibration page.',
        type: 'warning'
      });
      goto('/calibration');
      return;
    }
    showModal({
      title: 'Sensor Calibration',
      content: 'Are you sure you want to calibrate the sensors? If so please manually specify the current heading (direction) of the MAV in degrees.',
      confirmation: true,
      inputs: [
        {
          type: 'number',
          placeholder: 'Current Heading',
          required: true,
        }
      ],
      onConfirm: async (values) => {
        const heading = isNaN(parseInt(values[0])) ? 0 : values[0];
        await sendMavlinkCommand('FIXED_MAG_CAL_YAW', [heading, 0, mavLocation.lat, mavLocation.lng], { ardupilotMega: true });
        await new Promise((resolve) => setTimeout(resolve, CALIBRATION_SETTLE_DELAY_MS));
        await sendMavlinkCommand('PREFLIGHT_CALIBRATION', [0, 0, 0, 0, 4, 0, 0, 0]);
      }
    });
  }

  function stopMission() {
    showModal({
      title: 'Stop Mission',
      content: 'Are you sure you want to stop the mission?',
      confirmation: true,
      onConfirm: async () => {
        await setFlightMode('RTL');
        notify({
          title: 'Mission Stopped',
          content: 'The mission has been stopped.<br>Returning to launch.',
        });
      },
    });
  }

  function pauseMission() {
    showModal({
      title: 'Pause Mission',
      content: 'Are you sure you want to pause the mission?',
      confirmation: true,
      onConfirm: async () => {
        await setFlightMode('GUIDED');
        notify({
          title: 'Mission Paused',
          content: 'The mission has been paused.',
        });
      },
    });
  }

  function releasePayload() {
    showModal({
      title: 'Confirm Release Payload',
      content: 'Are you sure you want to release the payload?\nUse caution and ensure the drop zone is clear.',
      confirmation: true,
      onConfirm: async () => {
        if (!isGuidedLabel(mavMode)) await setFlightMode('GUIDED');
        await sendMavlinkCommand('DO_SET_SERVO', [GRIPPER_SERVO_CHANNEL, GRIPPER_OPEN_PWM_US]);
        await new Promise((resolve) => setTimeout(resolve, GRIPPER_CYCLE_DELAY_MS));
        await sendMavlinkCommand('DO_SET_SERVO', [GRIPPER_SERVO_CHANNEL, GRIPPER_CLOSE_PWM_US]);
      },
    });
  }

  let darkMode = $derived($darkModeStore);
  // The same flight controls route to each firmware's own way of flying: a MAVLink
  // autopilot runs its own mission, INAV runs its own mission over MSP, and
  // Betaflight (no waypoint engine) flies by companion guidance from the station.
  let fcIsMsp = $derived($fcProtocolStore === 'msp');
  let fcIsInav = $derived($fcProtocolStore === 'msp' && $fcFirmwareStore === 'INAV');
  function flyPlan() {
    if (fcIsInav) startInavMissionWithConfirm();
    else if (fcIsMsp) startGuidanceWithConfirm();
    else startMissionWithConfirm();
  }
  function endFlight() {
    if (fcIsInav) stopInavMission();
    else if (fcIsMsp) stopGuidance();
    else stopMission();
  }
  function onPause() {
    if (fcIsInav) stopInavMission();
    else if (fcIsMsp) stopGuidance();
    else pauseMission();
  }
  $effect(() => {
    mavModel = $mavModelStore;
    mavType = $mavTypeStore;
    isArmed = $mavArmedStateStore;
    systemState = $mavStateStore;
    mavMode = $mavModeStore;
    batteryStatus = $mavBatteryStore;
    altitude = $mavAltitudeStore;
    speed = $mavSpeedStore;
  });
  let missionPlanTitle = $derived($missionPlanTitleStore);
  let mavLocation = $derived($mavLocationStore);
  let missionProgress = $derived(getMissionProgress($missionIndexStore, $missionCountStore, $mavLocationStore as L.LatLng));
  let missionLoaded = $derived($missionPlanTitleStore !== '');
  let eta = $derived(calculateETA(missionProgress));
  let remainingDistance = $derived(calculateRemainingDistance($missionIndexStore, $mavLocationStore, $markersStore));

  function clearLoadedPlan() {
    showModal({
      title: 'Clear Mission Plan',
      content: 'Are you sure you want to clear the loaded mission plan? It is removed from the dashboard and cleared from the flight controller.',
      confirmation: true,
      onConfirm: async () => {
        if (!fcIsMsp) {
          await fetch('/api/mavlink/clear_mission', {
            method: 'POST',
            headers: { 'content-type': 'application/json' }
          });
        }
        await fetch('/api/mission/unload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' }
        });
        missionPlanTitleStore.set('');
        missionPlanActionsStore.set({});
        missionCompleteStore.set(true);
        notify({
          title: 'Mission Plan Cleared',
          content: 'The loaded mission plan has been cleared.',
          duration: 3000
        });
      }
    });
  }
</script>

<div
  class="elevated-surface stats p-4 rounded-2xl flex flex-col space-y-2 h-full overflow-y-auto overflow-x-hidden text-sm"
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
        {#if missionLoaded}
          <button class="clear-plan" onclick={clearLoadedPlan} title="Clear loaded plan" aria-label="Clear loaded mission plan">
            <i class="fas fa-times"></i>
          </button>
        {/if}
      </div>
      <div class="flex flex-col items-center justify-end">
        <div class="w-full">
          <span>
            Mission Progress: {systemState === 'Unknown' ? '--' : isAutoLabel(mavMode) ? missionProgress : 0}% (ETA {eta})
            <span class="text-[#66e1ff]"> {isAutoLabel(mavMode) ? (parseFloat(remainingDistance.toFixed(2)) || 0) : 0} m remaining</span>
          </span>
          <div class="progress-bar rounded-full h-2.5 mt-3">
            <div class="progress-bar-inner h-2.5 rounded-full" style="width: {isAutoLabel(mavMode) ? missionProgress : 0}%;"></div>
          </div>
        </div>
        <div class="button-container mt-6">
          <div class="relative group">
            <button class="circular-button" onclick={confirmCalibration}>
              <i class="far fa-compass text-[#ffa704] fa-spin"></i>
              <div class="tooltip text-white">Calibrate Sensors</div>
            </button>
          </div>
          <div class="relative group">
            <button class="circular-button" onclick={releasePayload} disabled={fcIsMsp}>
              <i class="fas fa-parachute-box"></i>
              <div class="tooltip text-white">Release Payload</div>
            </button>
          </div>
          {#if systemState === 'STANDBY' || !isArmed}
            <div class="relative group flex flex-col items-center">
              <button class="circular-button" onclick={takeoffWithConfirm} disabled={isAutoLabel(mavMode) && systemState !== 'STANDBY'}>
                <i class="fas fa-plane-departure"></i>
                <div class="tooltip text-white">Initiate Takeoff</div>
              </button>
            </div>
          {:else}
            <div class="relative group flex flex-col items-center">
              <button class="circular-button" onclick={landWithConfirm} disabled={isAutoLabel(mavMode) || mavMode.includes('LAND')}>
                <i class="fas fa-plane-arrival"></i>
                <div class="tooltip text-white">Initiate Landing</div>
              </button>
            </div>
          {/if}
          {#if !isAutoLabel(mavMode) || systemState === 'STANDBY'}
            <div class="relative group">
              <button
                class="circular-button" onclick={flyPlan}
                disabled={(isAutoLabel(mavMode) && systemState !== 'STANDBY') || (!missionLoaded && !fcIsMsp)}
              >
                <i class="fas fa-play"></i>
                <div class="tooltip text-white">Start/Resume Mission</div>
              </button>
            </div>
          {:else}
            <div class="relative group">
              <button
                class="circular-button" onclick={onPause}
                disabled={!isAutoLabel(mavMode) && !fcIsMsp}
              >
                <i class="fas fa-pause"></i>
                <div class="tooltip text-white">Pause Mission (Loiter)</div>
              </button>
            </div>
          {/if}
          <div class="relative group">
            <button
              class="circular-button" onclick={endFlight}
              disabled={(!isAutoLabel(mavMode) || !missionLoaded) && !fcIsMsp}
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

  .clear-plan {
    margin-left: 0.35rem;
    padding: 0 0.3rem;
    font-size: 0.75rem;
    line-height: 1;
    color: #9ca3af;
    border-radius: 0.3rem;
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
  }

  .clear-plan:hover {
    color: #f87171;
    background-color: rgb(from #f87171 r g b / 0.12);
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

  /* The icon's inline line box inherits a taller line-height than the glyph,
     which shifts it off the circle's center. */
  .circular-button i {
    line-height: 1;
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
    border-radius: var(--radius-control);
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
