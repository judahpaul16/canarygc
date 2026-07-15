<script lang="ts">
  import DPad from './DPad.svelte';
  import { mapWindow, mapPanel } from '../lib/map-window';
  import Weather from './Weather.svelte';
  import { mavModeStore, mavAltitudeStore, mavLocationStore, mavSatelliteStore, mavTypeStore } from '../stores/mavlinkStore';
  import { sendMavlinkCommand, setFlightMode, setPositionLocal, setDepthGlobal, setAltitudeGlobal } from '../lib/mavlink-client';
  import { isGuidedLabel, isSubmarine, isGroundOrSurface, isPlane } from '../lib/flight-modes';
  import { gamepadActiveStore, toggleGamepad } from '../lib/gamepad-session';

  const SPEED_TYPE_AIRSPEED = 0;
  const SPEED_TYPE_GROUNDSPEED = 1;
  const THROTTLE_NO_CHANGE = -1;
  const SPEED_ABSOLUTE = 0;
  const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1;
  const SUB_DEPTH_HOLD_MODE = 2; // ArduSub ALT_HOLD (depth hold)
  const YAW_STEP_DEG = 10;
  const YAW_RATE_DEG_PER_S = 10;
  const YAW_RELATIVE_OFFSET = 1;
  const ALTITUDE_STEP_M = 10;

  let altitude = $derived($mavAltitudeStore);
  let maxSpeed: string = $state('');
  let altitudeSetPoint: string = $state('');

  let mavMode = $derived($mavModeStore);
  let mavLocation = $derived($mavLocationStore);
  let mavSatellite = $derived($mavSatelliteStore);
  let gamepadActive = $derived($gamepadActiveStore);
  // A submarine commands depth (a positive value dives, so the NED-down z is
  // positive); a rover or boat has no vertical axis and hides the control.
  let submarine = $derived(isSubmarine($mavTypeStore));
  let surface = $derived(isGroundOrSurface($mavTypeStore));

  async function ensureGuided() {
    if (!isGuidedLabel(mavMode)) await setFlightMode('GUIDED');
  }

  // ArduSub holds depth in ALT_HOLD (depth hold), which needs only a depth
  // sensor and so works on a sub with no horizontal position source. Depth
  // setpoints are ignored in modes that do not hold depth.
  async function ensureDepthHold() {
    if (mavMode !== 'ALT_HOLD')
      await sendMavlinkCommand('DO_SET_MODE', [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, SUB_DEPTH_HOLD_MODE, 0], {
        cmdLong: true
      });
  }

  async function setSpeedAndVertical() {
    const speed = parseFloat(maxSpeed);
    // ArduPlane holds airspeed; copter, rover, and boat use groundspeed.
    if (!isNaN(speed))
      sendMavlinkCommand('DO_CHANGE_SPEED', [
        isPlane() ? SPEED_TYPE_AIRSPEED : SPEED_TYPE_GROUNDSPEED,
        speed,
        THROTTLE_NO_CHANGE,
        SPEED_ABSOLUTE
      ]);
    const vertical = parseFloat(altitudeSetPoint);
    if (!isNaN(vertical)) {
      if (submarine) {
        await ensureDepthHold();
        setDepthGlobal(vertical);
      } else if (isPlane()) {
        await ensureGuided();
        setAltitudeGlobal(vertical);
      } else {
        await ensureGuided();
        setPositionLocal(0, 0, -vertical);
      }
    }
  }

  // The up arrow climbs (air) or ascends toward the surface (sub); the down
  // arrow descends. A submarine's depth is a positive number of meters below
  // the surface, floored at 0 so ascending never commands a target above it.
  async function verticalStep(up: boolean) {
    if (submarine) {
      await ensureDepthHold();
      const currentDepth = Math.max(0, -altitude);
      const target = up ? Math.max(0, currentDepth - ALTITUDE_STEP_M) : currentDepth + ALTITUDE_STEP_M;
      setDepthGlobal(target);
    } else {
      await ensureGuided();
      const target = altitude + (up ? ALTITUDE_STEP_M : -ALTITUDE_STEP_M);
      if (isPlane()) setAltitudeGlobal(target);
      else setPositionLocal(0, 0, -target);
    }
  }


</script>

<div class="controls px-10 rounded-2xl h-full flex items-center overflow-x-auto overflow-y-hidden gap-4"
  use:mapPanel
  >
  <button
    class="gamepad-btn"
    aria-label="Toggle gamepad flight"
    data-tip={gamepadActive ? 'Stop gamepad flight' : 'Fly with a gamepad'}
    data-tip-pos="left"
    onclick={toggleGamepad}
  >
    <i class="fas fa-gamepad {gamepadActive ? 'text-[#61cd89]' : ''}"></i>
  </button>
  <div class="mini-col flex flex-col">
    <div class="mini-map flex-shrink-0 h-48 w-48" use:mapWindow={{ overlay: false }}></div>
    <div class="hdop-strip flex justify-between w-full px-2 pt-2">
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
    <div class="weather column flex flex-col items-center justify-end">
      <Weather {mavLocation} isDashboard={true} />
    </div>
    <div class="separator"></div>
    <div class="inputs column h-full flex flex-col items-center justify-center text-center min-w-[150px] overflow-auto gap-2 self-center">
      <form>
        <div id="max-speed-container" class="flex flex-col items-center">
          <div class="label text-sm mb-1">Max Speed<span class="text-xs text-gray-400 mt-1 ml-1">(m/s)</span></div>
          <input type="number" min="0" class="form-input mb-2" placeholder="10 m/s" bind:value={maxSpeed} />
        </div>
        {#if !surface}
          <div class="flex flex-col items-center justify-center">
            <div class="label text-sm mb-1">
              {submarine ? 'Go to Depth' : 'Go to Altitude'}<span class="text-xs text-gray-400 mt-1 ml-1">(m)</span>
            </div>
            <input type="number" min="0" max="100" class="form-input" placeholder="100 m" bind:value={altitudeSetPoint} />
          </div>
        {/if}
        <button class="set-btn text-[8pt] rounded-full py-1 px-3 mt-2"
          onclick={(e) => {
            e.preventDefault();
            setSpeedAndVertical();
          }}>
          Set
        </button>
      </form>
    </div>
    {#if !surface}
      <div class="separator"></div>
      <div class="alt-btns column flex flex-col items-center justify-center text-center space-y-4">
        <div class="flex flex-col items-center">
          <div class="label text-sm mb-1" title={submarine ? 'Ascend' : 'Altitude Up'}>{submarine ? 'Ascend' : 'Altitude Up'}</div>
          <button class="alt-button rounded-full" aria-label={submarine ? 'Ascend' : 'Altitude up'} onclick={() => verticalStep(true)}>
            <i class="alt-up fas fa-arrow-up"></i>
          </button>
        </div>
        <div class="flex flex-col items-center justify-center">
          <div class="label text-sm mb-1" title={submarine ? 'Descend' : 'Altitude Down'}>{submarine ? 'Descend' : 'Altitude Down'}</div>
          <button class="alt-button rounded-full" aria-label={submarine ? 'Descend' : 'Altitude down'} onclick={() => verticalStep(false)}>
              <i class="alt-down fas fa-arrow-down"></i>
          </button>
        </div>
      </div>
    {/if}
    <div class="separator"></div>
    <div class="rotate-btns column flex flex-col items-center justify-center text-center space-y-4">
      <div id="rotate-left-button" class="flex flex-col items-center">
        <div class="label text-sm mb-1">Rotate Left</div>
        <button class="rotate-button rotate-left rounded-full" aria-label="Rotate left"
          onclick={async () => {
              await ensureGuided();
              sendMavlinkCommand('CONDITION_YAW', [YAW_STEP_DEG, YAW_RATE_DEG_PER_S, -1, YAW_RELATIVE_OFFSET]);
            }}>
          <i class="fas fa-rotate-left"></i>
        </button>
      </div>
      <div class="flex flex-col items-center">
        <div class="label text-sm mb-1">Rotate Right</div>
        <button class="rotate-button rotate-right rounded-full" aria-label="Rotate right"
          onclick={async () => {
              await ensureGuided();
              sendMavlinkCommand('CONDITION_YAW', [YAW_STEP_DEG, YAW_RATE_DEG_PER_S, 1, YAW_RELATIVE_OFFSET]);
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
    border-radius: var(--radius-surface);
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
    border-radius: var(--radius-control);
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

  .controls {
    position: relative;
    color: var(--fontColor);
  }

  /* Pinned to the card's inner corner: absolute against the component root,
     out of flow, so the flex row of control columns never shifts. Sits above
     the D-pad's own tooltip layer so its tooltip is never covered. */
  .gamepad-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 65;
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 2px solid var(--tertiaryColor);
    border-radius: 9999px;
    cursor: pointer;
  }

  .gamepad-btn:hover {
    filter: brightness(1.2);
  }

  /* :global reaches child-component roots (the D-pad); the scoped universal
     selector only matches this component's own elements, leaving embedded
     components inert inside the pass-through card. */
  .controls > :global(*) {
    pointer-events: auto;
  }

  .mini-col {
    pointer-events: none;
  }

  .hdop-strip {
    pointer-events: auto;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    /* The mini-map spans the full card width here, so the corner button gets
       its own strip of card above it instead of overlapping the map corner. */
    .controls {
      padding: 1rem;
      padding-top: 3.5rem;
      display: block;
    }

    .controls > * {
      display: flex;
      align-items: normal;
      justify-content: center;
      width: 100%;
      margin: auto;
    }

    .controls > .gamepad-btn {
      width: 2.25rem;
      margin: 0;
      align-items: center;
    }

    .mini-map {
      width: auto;
    }

    .controls > div > div:nth-of-type(2) {
      flex-direction: row;
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
