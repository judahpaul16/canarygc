<script lang="ts">
  import { flightPlanTitleStore, flightPlanActionsStore } from '../stores/flightPlanStore';
  import { mavTypeStore, mavStateStore, mavAltitudeStore, mavSpeedStore } from '../stores/mavlinkStore';
  import { get } from 'svelte/store';

  import Modal from './Modal.svelte';

  export let mavName: string = "CUAV X7 Running Ardupilot";
  export let mavType: string = get(mavTypeStore);
  export let speed: number = get(mavSpeedStore);
  export let altitude: number = get(mavAltitudeStore);
  export let systemState: string = get(mavStateStore);
  export let batteryStatus: number = 100;
  export let altitudeLimited: number = 100;
  export let flightProgress: number = 50;

  let interval: number;

  $: mavType = $mavTypeStore;
  $: systemState = $mavStateStore;
  $: altitude = $mavAltitudeStore;
  $: speed = $mavSpeedStore;
  $: flightPlanTitle = $flightPlanTitleStore;

  function stopFlight() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Stop Flight',
        content: 'Are you sure you want to stop the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: () => {
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Flight Stopped',
              content: 'The flight has been stopped.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
        },
      }
    });
    document.body.appendChild(modal.$$.fragment);
  }

  function pauseFlight() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Pause Flight',
        content: 'Are you sure you want to pause the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: () => {
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Flight Paused',
              content: 'The flight has been paused.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
        },
      }
    });
    document.body.appendChild(modal.$$.fragment);
  }

  function resumeFlight() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Resume Flight',
        content: 'Are you sure you want to resume the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: () => {
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Flight Resumed',
              content: 'The flight has been resumed.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
        },
      }
    });
  }

  function releasePayload() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Release Payload',
        content: 'Are you sure you want to release the payload?\nUse caution and ensure the drop zone is clear.',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: () => {
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Payload Released',
              content: 'The payload has been released.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
        },
      }
    });
    document.body.appendChild(modal.$$.fragment);
  }

  function initLanding() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Land',
        content: 'Are you sure you want to land the MAV?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: () => {
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Landing',
              content: 'The MAV is landing.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
        },
      }
    });
    document.body.appendChild(modal.$$.fragment);
  }
</script>

<style>
  .progress-bar-inner {
    background: linear-gradient(45deg, #4c75af 25%, transparent 25%, transparent 50%, #66e1ff 50%, #66e1ff 75%, transparent 75%, transparent);
    background-size: 30px 30px;
    animation: progress-bar 1s linear infinite;
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
    color: white;
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
    display: flex;
    justify-content: center;
    gap: 1vw;
    margin-top: 1.5rem;
  }

  .circular-button {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #3f3f40;
    color: white;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.3s;
    position: relative;
  }

  .circular-button:hover {
    background-color: #4f4f50;
  }

  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 0.5rem;
    background-color: black;
    color: white;
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
    background-color: #656974;
    cursor: not-allowed;
  }
</style>

<div class="stats bg-[#1c1c1e] text-white p-4 rounded-lg flex flex-col space-y-2 h-full overflow-y-auto text-sm">
  <h2 class="text-lg font-bold">{mavName}</h2>
  <hr class="border-[#2d2d2d]" />
  <div class="h-full flex flex-col justify-evenly">
    <div class="grid grid-cols-2 gap-2">
      <div>MAV Type: {mavType}</div>
      <div>System State: {systemState}</div>
      <div>Speed: {speed} m/s</div>
      <div>Altitude: {altitude} m</div>
      <div class="battery-status {batteryStatus < 20 ? 'red' : batteryStatus < 50 ? 'yellow' : 'green'}">Battery Status: {batteryStatus}%</div>
      <div>Altitude Limited: {altitudeLimited} m</div>
    </div>
    <hr class="border-[#2d2d2d] my-3" />
      <div class="w-full mb-2">Loaded Mission Plan: <span class="text-[#66e1ff]">{flightPlanTitle || 'No mission plan loaded.'}</span></div>
      <div class="flex flex-col items-center justify-end">
        <div class="w-full">
          <span>Flight Progress: {flightProgress}% (ETA 00:00:00)</span>
          <div class="progress-bar bg-gray-700 rounded-full h-2.5 mt-3">
            <div class="progress-bar-inner h-2.5 rounded-full" style="width: {flightProgress}%;"></div>
          </div>
        </div>
        <div class="button-container mt-6">
          <div class="relative group">
            <button class="circular-button" on:click={releasePayload}>
              <i class="fas fa-parachute-box"></i>
              <div class="tooltip">Release Payload</div>
            </button>
          </div>
          <div class="relative group flex flex-col items-center">
            <button class="circular-button" on:click={initLanding}>
              <i class="fas fa-plane-arrival"></i>
              <div class="tooltip">Initiate Landing</div>
            </button>
          </div>
          <div class="relative group">
            <button class="circular-button" on:click={stopFlight}>
              <i class="fas fa-stop text-red-400"></i>
              <div class="tooltip">Stop Flight (RTL)</div>
            </button>
          </div>
          <div class="relative group">
            <button class="circular-button" on:click={resumeFlight} disabled>
              <i class="fas fa-play"></i>
              <div class="tooltip">Start/Resume Flight</div>
            </button>
          </div>
          <div class="relative group">
            <button class="circular-button" on:click={pauseFlight}>
              <i class="fas fa-pause"></i>
              <div class="tooltip">Pause Flight (Loiter)</div>
            </button>
          </div>
        </div>
      </div>
  </div>
</div>
