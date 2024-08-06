<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let droneName: string = "DroneX";
  export let speed: number;
  export let height: number;
  export let flightTime: number;
  export let lens: string;
  export let iso: number;
  export let frameLine: string;
  export let shutter: number;
  export let resolution: string;
  export let batteryStatus: number;
  export let altitudeLimited: number;
  export let flightProgress: number = 50;

  let interval: number;

  function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function mockDataUpdate() {
    speed = Math.max(0, Math.min(20, speed + getRandomInt(-2, 2)));
    height = Math.max(0, Math.min(100, height + getRandomInt(-5, 5)));
    flightTime = flightTime + 1;
    frameLine = `${getRandomInt(24, 60)}fps`;
    batteryStatus = Math.max(0, Math.min(100, batteryStatus - 1));
    flightProgress = Math.max(0, Math.min(100, flightProgress + 1));
  }

  onMount(() => {
    speed = 20;
    height = 0;
    batteryStatus = 100;
    altitudeLimited = 100;
    interval = window.setInterval(() => {
      mockDataUpdate();
    }, 1000);
  });

  onDestroy(() => {
    clearInterval(interval);
  });

  function stopFlight() {
    alert('Stop Flight');
  }

  function pauseFlight() {
    alert('Pause Flight (Loiter)');
  }

  function resumeFlight() {
    alert('Resuming Flight...');
  }

  function returnHome() {
    alert('Return Home');
  }

  function initLanding() {
    alert('Landing...');
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
    gap: 1rem;
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
</style>

<div class="stats bg-[#1c1c1e] text-white p-4 rounded-lg flex flex-col space-y-2 h-full overflow-y-auto text-sm">
  <h2 class="text-lg font-bold">{droneName}</h2>
  <div class="grid grid-cols-2 gap-4">
    <div>Speed: {speed} m/s</div>
    <div>Height: {height} m</div>
    <div>Flight Time: {`${Math.floor(flightTime / 3600)}h ${Math.floor((flightTime % 3600) / 60)}m ${flightTime % 60}s`}</div>
    <div>Lens: {lens}</div>
    <div>ISO: {iso}</div>
    <div>Frame Line: {frameLine}</div>
    <div>Shutter: {shutter}</div>
    <div>Resolution: {resolution}</div>
    <div class="battery-status {batteryStatus < 20 ? 'red' : batteryStatus < 50 ? 'yellow' : 'green'}">Battery Status: {batteryStatus}%</div>
    <div>Altitude Limited: {altitudeLimited} m</div>
  </div>
  <div class="w-full mt-6">
    <span>Flight Progress</span>
    <div class="progress-bar bg-gray-700 rounded-full h-2.5 mt-2">
      <div class="progress-bar-inner h-2.5 rounded-full" style="width: {flightProgress}%;"></div>
    </div>
  </div>
  <div class="button-container mt-6">
    <div class="relative group">
      <button class="circular-button" on:click={stopFlight}>
        <i class="fas fa-stop text-red-400"></i>
        <div class="tooltip">Stop Flight</div>
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
    <div class="relative group flex flex-col items-center">
      <button class="circular-button" on:click={initLanding}>
        <i class="fas fa-arrow-down"></i>
        <div class="tooltip">Land</div>
      </button>
    </div>
    <div class="relative group">
      <button class="circular-button" on:click={returnHome}>
        <i class="fas fa-home"></i>
        <div class="tooltip">Return Home</div>
      </button>
    </div>
  </div>
</div>
