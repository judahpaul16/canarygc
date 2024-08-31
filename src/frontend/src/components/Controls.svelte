<script lang="ts">
  import Map from './Map.svelte';
  import DPad from './DPad.svelte';
  import Weather from './Weather.svelte';
  import { mavAltitudeStore, mavLocationStore } from '../stores/mavlinkStore';
  import { onMount } from 'svelte';

  $: mavLocation = $mavLocationStore;
  $: altitude = $mavAltitudeStore;

  onMount(() => {
    mavAltitudeStore.subscribe((value) => {
      altitude = value;
    });
  });

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
  async function setPositionLocal(x: string, y: string, z: string) {
    const response = await fetch("/api/mavlink/set_position_local", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x": x,
        "y": y,
        "z": z,
      },
    });
    if (response.ok) {
      console.log(`Local position set successfully: x: ${x}, y: ${y}, z: ${z}`);
    } else {
      console.error("Failed to set local position");
    }
  }
</script>

<div class="controls bg-[#1c1c1e] text-white px-10 rounded-lg h-full flex items-center overflow-x-auto gap-4">
  <div class="map-container flex-shrink-0 h-48 w-48">
    <Map {mavLocation} hideOverlay={true} />
  </div>
  <div class="flex w-full justify-center">
    <div class="weather column flex flex-col items-center justify-center">
      <Weather {mavLocation} isDashboard={true} />
    </div>
    <div class="separator"></div>
    <div class="inputs column h-full flex flex-col items-center justify-center text-center min-w-[150px] overflow-auto gap-2 self-center">
      <div id="max-speed-container" class="flex flex-col items-center">
        <div class="label text-sm mb-1">Max Speed<span class="text-xs text-gray-400 mt-1 ml-1">(m/s)</span></div>
        <input type="number"  min="0" class="form-input" placeholder="Default: 10" />
      </div>
      <div class="flex flex-col items-center justify-center">
        <div class="label text-sm mb-1">Max Altitude<span class="text-xs text-gray-400 mt-1 ml-1">(m)</span></div>
        <input type="number"  min="0" class="form-input" placeholder="Default: 100" />
      </div>
      <button class="bg-[#2d2d2d] hover:brightness-150 text-xs text-white rounded-full py-1 px-4 mt-1">Set</button>
    </div>
    <div class="separator"></div>
    <div class="column flex flex-col items-center justify-center text-center space-y-4">
      <div class="flex flex-col items-center">
        <div class="label text-sm mb-1">Alt. Up</div>
        <button class="alt-button rounded-full"
            on:click={() => {setPositionLocal('0', '0', `-${altitude + 10}`)}}>
          <i class="alt-up fas fa-person-arrow-up-from-line"></i>
        </button>
      </div>
      <div class="flex flex-col items-center justify-center">
        <div class="label text-sm mb-1">Alt. Down</div>
        <button class="alt-button rounded-full"
            on:click={() => {setPositionLocal('0', '0', `-${altitude - 10}`)}}>
          <i class="alt-down fas fa-person-arrow-down-to-line"></i>
        </button>
      </div>
    </div>
    <div class="separator"></div>
    <div class="rotate-btns column flex flex-col items-center justify-center text-center space-y-4">
      <div id="rotate-left-button" class="flex flex-col items-center">
        <div class="label text-sm mb-1">Rotate Left</div>
        <button class="rotate-button rotate-left rounded-full"
          on:click={() => {
            sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
            sendMavlinkCommand('CONDITION_YAW', `${[10, 10, -1, 1]}`);
            }}>
          ⟲
        </button>
      </div>
      <div class="flex flex-col items-center">
        <div class="label text-sm mb-1">Rotate Right</div>
        <button class="rotate-button rotate-right rounded-full"
          on:click={() => {
            sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
            sendMavlinkCommand('CONDITION_YAW', `${[10, 10, 1, 1]}`);
            }}>
          ⟳
        </button>
      </div>
    </div>
  </div>
  <DPad />
</div>

<style>
  .column {
    flex: 1;
    padding: 0 1rem;
  }

  .separator {
    width: 1px;
    background-color: #4f4f50;
    margin: 0 1rem;
  }

  .form-input,
  .alt-button,
  .rotate-button {
    appearance: none;
    background-color: #374151;
    transition: background-color 0.3s ease;
  }

  input[type='number'] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #2d2d2d;
    border-radius: 1em;
    background-color: #3f3f40;
    color: white;
    font-size: calc(0.4rem + 0.5vw);
    transition: border-color 0.3s;
  }

  .form-input {
    border: 1px solid #374151;
    padding: 0.5rem;
  }

  .form-input:focus {
    outline: none;
    border-color: #66e1ff;
  }

  .alt-button,
  .rotate-button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 3rem;
    height: 3rem;
    background-color: #3f3f40;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    transition: background-color 0.3s;
    border: none;
  }

  .alt-button:hover,
  .rotate-button:hover {
    background-color: #4f4f50;
  }

  .rotate-left:hover {
    animation: rotate-left 0.6s;
    color: #66e1ff;
  }

  .rotate-right:hover {
    animation: rotate-right 0.6s;
    color: #66e1ff;
  }

  @keyframes rotate-left {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(-360deg);
    }
  }

  @keyframes rotate-right {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .alt-button:hover .alt-up {
    transform: translateY(-0.2rem);
    color: #66e1ff;
  }

  .alt-button:hover .alt-down  {
    transform: translateY(0.2rem);
    color: #66e1ff;
  }
  
  .label {
    font-size: 0.75em;
  }

  .map-container {
    padding: 3px;
    background: #3d3d3d;
    border-radius: 10px;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    .controls {
      padding: 1rem;
      display: block;
    }

    .controls > * {
      display: flex;
      align-items: normal;
      justify-content: center;
      width: 100%;
      margin: auto;
    }

    .weather {
      display: none;
    }

    .inputs {
      max-height: fit-content;
      padding: 1em;
    }

    .inputs, .rotate-btns {
      display: ruby;
    }

    #max-speed-container, #rotate-left-button {
      margin-right: 1rem;
    }

    .flex {
      flex-direction: column;
    }

    .separator {
      display: none;
    }

    .form-input {
      padding: 0.5rem 1rem;
    }

    .alt-button,
    .rotate-button {
      width: 2rem;
      height: 2rem;
      font-size: 1rem;
    }
  }
</style>
