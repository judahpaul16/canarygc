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
    mavLocationStore
  } from '../stores/mavlinkStore';
  import { darkModeStore, primaryColorStore, secondaryColorStore, tertiaryColorStore } from '../stores/customizationStore';
  import { get } from 'svelte/store';

  import Modal from './Modal.svelte';
  import Notification from './Notification.svelte';

  export let mavModel: string = get(mavModelStore);
  export let mavType: string = get(mavTypeStore);
  export let isArmed: boolean = get(mavArmedStateStore)
  export let speed: number = get(mavSpeedStore);
  export let altitude: number = get(mavAltitudeStore);
  export let systemState: string = get(mavStateStore);
  export let batteryStatus: number | null = get(mavBatteryStore);
  export let mavMode: string = get(mavModeStore);

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
  $: missionProgress = Math.round(($missionIndexStore / $missionCountStore) * 100);
  $: missionLoaded = $missionPlanTitleStore !== '';

  async function sendMavlinkCommand(command: string, params: string  = '', useArduPilotMega: string = 'false') {
    const response = await fetch(`/api/mavlink/send_command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'command': command,
        'params': params,
        'useArduPilotMega': useArduPilotMega
      },
    });
    if (response.ok) {
      console.log(await response.text());
    } else {
      console.error(`Error: ${await response.text()}`);
    }
  }

  function confirmToggleArmDisarm() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Arm / Disarm',
        content: 'Are you sure you want to arm/disarm the MAV?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          modal.$destroy();
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 4]}`); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          await sendMavlinkCommand('COMPONENT_ARM_DISARM', `${[isArmed ? 0 : 1, 0]}`); // param2: 21196 bypasses pre-arm checks
        }
      }
    });
  }

  function stopMission() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Stop Mission',
        content: 'Are you sure you want to stop the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 6]}`); // 6 is RTL: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
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
        content: 'Are you sure you want to pause the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 16]}`); // 16 is POSHOLD: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
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

  function resumeMission() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Start / Resume Mission',
        content: 'Are you sure you want to resume the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          missionIndexStore.set(1);
          missionCompleteStore.set(false);
          if (get(mavStateStore) === 'STANDBY') {
            await sendMavlinkCommand('DO_SET_MODE' , `${[1, 4]}`); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
            await sendMavlinkCommand('COMPONENT_ARM_DISARM', `${[1, 0]}`); // param2: 21196 bypasses pre-arm checks
            await sendMavlinkCommand('NAV_TAKEOFF', `${[0, 0, 0, 0, 0, 0, 10]}`);
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          }
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 3]}`); // 3 is AUTO Mode: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
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
          await sendMavlinkCommand('DO_SET_SERVO' , `${[1, 9, 2000]}`); // 9 is the servo number for the payload release mechanism
          modal.$destroy();
          const notification = new Notification({
            target: document.body,
            props: {
              title: 'Payload Released',
              content: 'The payload has been released.',
              type: 'info',
            }
          });
          setTimeout(() => notification.$destroy(), 10000);
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
          }
        ],
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 4]}`); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          await sendMavlinkCommand('COMPONENT_ARM_DISARM', `${[1, 0]}`); // param2: 21196 bypasses pre-arm checks
          await sendMavlinkCommand('NAV_TAKEOFF', `${[0, 0, 0, 0, 0, 0, parseInt(modal.inputValues![0])]}`);
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
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 4]}`); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          await sendMavlinkCommand('NAV_LAND', `${[0, 0, 0, 0, mavLocation.lat, mavLocation.lng, 0]}`);
        },
      }
    });
  }
  
  function checkMode(target: string, mode: string) {
    return target.includes(mode);
  }
</script>

<div
  class="stats p-4 rounded-lg flex flex-col space-y-2 h-full overflow-y-auto overflow-x-hidden text-sm"
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
          <span>Mission Progress: {systemState === 'Unknown' ? '--' : mavMode === 'AUTO' ? missionProgress : 0}% (ETA 00:00:00)</span>
          <div class="progress-bar rounded-full h-2.5 mt-3">
            <div class="progress-bar-inner h-2.5 rounded-full" style="width: {mavMode === 'AUTO' ? missionProgress : 0}%;"></div>
          </div>
        </div>
        <div class="button-container mt-6">
          <div class="relative group">
            <button class="circular-button" on:click={confirmToggleArmDisarm}>
              <i class="fas fa-key text-[#fffa0a]"></i>
              <div class="tooltip text-white">Arm / Disarm</div>
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
                class="circular-button" on:click={resumeMission}
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
    color: yellow;
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
