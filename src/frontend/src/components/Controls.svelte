<script lang="ts">
  import Map from './Map.svelte';
  import DPad from './DPad.svelte';
  import Weather from './Weather.svelte';
  import { mavModeStore, mavAltitudeStore, mavLocationStore, mavSatelliteStore } from '../stores/mavlinkStore';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';
  import { get } from 'svelte/store';

  let altitude = get(mavAltitudeStore);
  let maxSpeed: string = '';
  let altitudeSetPoint: string = '';

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';
  $: mavMode = $mavModeStore;
  $: mavLocation = $mavLocationStore;
  $: altitude = $mavAltitudeStore;
  $: mavSatellite = $mavSatelliteStore;

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

<div class="controls px-10 rounded-2xl h-full flex items-center overflow-x-auto gap-4"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
  >
  <div class="flex flex-col">
    <div class="map-container flex-shrink-0 h-48 w-48">
      <Map {mavLocation} hideOverlay={true} />
    </div>
    <div class="flex justify-between w-full px-2 pt-2">
      <span class="text-xs text-gray-400">
        <a href="https://en.wikipedia.org/wiki/Dilution_of_precision_(navigation)" target="_blank">
          <i class="far fa-question-circle relative">
            <div class="tooltip">&lt; 1:	Ideal
              <br><br>1 - 2:	Excellent
              <br><br>2 - 5:	Good
              <br><br>5 - 10:	Moderate
              <br><br>10 - 20:	Fair
              <br><br>&gt; 20:	Poor
            </div>
          </i>
        </a>
        HDOP: <span class="{mavSatellite.hdop > 20 ? 'text-red-300' : mavSatellite.hdop > 5 && mavSatellite.hdop < 20 ? 'text-yellow-300' : 'text-green-300'}">
          {mavSatellite.hdop.toFixed(2)}
        </span>
      </span>
      <span class="text-xs text-gray-400">
        # Sats: <span class="{mavSatellite.total < 6 ? 'text-red-300' : 'text-green-300'}">
        {mavSatellite.total}</span>
      </span>
    </div>
  </div>
  <div class="flex w-full justify-center">
    <div class="weather column flex flex-col items-center justify-center">
      <Weather {mavLocation} isDashboard={true} />
    </div>
    <div class="separator"></div>
    <div class="inputs column h-full flex flex-col items-center justify-center text-center min-w-[150px] overflow-auto gap-2 self-center">
      <form>
        <div id="max-speed-container" class="flex flex-col items-center">
          <div class="label text-sm mb-1">Max Speed<span class="text-xs text-gray-400 mt-1 ml-1">(m/s)</span></div>
          <input type="number" min="0" class="form-input mb-2" placeholder="10 m/s" bind:value={maxSpeed} />
        </div>
        <div class="flex flex-col items-center justify-center">
          <div class="label text-sm mb-1">Go to Altitude<span class="text-xs text-gray-400 mt-1 ml-1">(m)</span></div>
          <input type="number" min="0" class="form-input" placeholder="100 m" bind:value={altitudeSetPoint} />
        </div>
        <button class="set-btn text-[8pt] rounded-full py-1 px-3 mt-2"
          on:click|preventDefault={() => {
            if (!isNaN(parseInt(maxSpeed))) sendMavlinkCommand('DO_CHANGE_SPEED', `${[1, maxSpeed]}`);
            if (!isNaN(parseInt(altitudeSetPoint))) setPositionLocal('0', '0', `-${altitudeSetPoint}`);
          }}>
          Set
        </button>
      </form>
    </div>
    <div class="separator"></div>
    <div class="alt-btns column flex flex-col items-center justify-center text-center space-y-4">
      <div class="flex flex-col items-center">
        <div class="label text-sm mb-1" title="Altitude Up">Altitude Up</div>
        <button class="alt-button rounded-full" on:click={() => {
          if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
          setPositionLocal('0', '0', `-${altitude + 10}`)
        }}>
          <i class="alt-up fas fa-arrow-up"></i>
        </button>
      </div>
      <div class="flex flex-col items-center justify-center">
        <div class="label text-sm mb-1" title="Altitude Down">Altitude Down</div>
        <button class="alt-button rounded-full" on:click={() => {
            if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
            setPositionLocal('0', '0', `-${altitude - 10}`)
          }}>
            <i class="alt-down fas fa-arrow-down"></i>
        </button>
      </div>
    </div>
    <div class="separator"></div>
    <div class="rotate-btns column flex flex-col items-center justify-center text-center space-y-4">
      <div id="rotate-left-button" class="flex flex-col items-center">
        <div class="label text-sm mb-1">Rotate Left</div>
        <button class="rotate-button rotate-left rounded-full"
          on:click={() => {
              if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
              sendMavlinkCommand('CONDITION_YAW', `${[10, 10, -1, 1]}`);
            }}>
          <i class="fas fa-rotate-left"></i>
        </button>
      </div>
      <div class="flex flex-col items-center">
        <div class="label text-sm mb-1">Rotate Right</div>
        <button class="rotate-button rotate-right rounded-full"
          on:click={() => {
              if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
              sendMavlinkCommand('CONDITION_YAW', `${[10, 10, 1, 1]}`);
            }}>
          <i class="fas fa-rotate-right"></i>
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
    width: 2px;
    background-color: var(--tertiaryColor);
    margin: 0 1rem;
  }

  .form-input,
  .alt-button,
  .rotate-button {
    appearance: none;
    background-color: #374151;
    transition: background-color 0.3s ease;
  }

  .set-btn {
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 1px solid var(--tertiaryColor);
  }

  .set-btn:hover {
    color: #ffffff;
    background-color: #4e94f7;
    border: 1px solid var(--secondaryColor);
  }

  input[type='number'] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--tertiaryColor);
    border-radius: 1em;
    background-color: var(--secondaryColor);
    color: white;
    font-size: 10pt;
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
    background-color: var(--tertiaryColor);
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    transition: background-color 0.3s;
    border: none;
  }

  .alt-button:hover,
  .rotate-button:hover {
    filter: brightness(1.1);
  }

  .rotate-left:hover {
    animation: rotate-left 0.6s;
    color: #4e94f7;
  }

  .rotate-right:hover {
    animation: rotate-right 0.6s;
    color: #4e94f7;
  }

  .tooltip {
    position: absolute;
    top: -1000%;
    left: 0;
    height: auto;
    max-width: 200px;
    display: flex;
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
    z-index: 1;
  }

  i:hover .tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateY(-45px);
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
    color: #4e94f7;
  }

  .alt-button:hover .alt-down  {
    transform: translateY(0.2rem);
    color: #4e94f7;
  }
  
  .label {
    font-size: 10pt;
  }

  .map-container {
    padding: 4px;
    background: var(--secondaryColor);
    border-radius: 1rem;
  }

  .controls {
    color: var(--fontColor);
    background-color: var(--primaryColor);
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

    #rotate-left-button {
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

    .alt-btns {
      flex-direction: row;
      align-items: baseline;
      gap: 1rem;
    }
  }
</style>
