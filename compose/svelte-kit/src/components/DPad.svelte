<script lang="ts">
  import { mavModeStore, mavAltitudeStore } from '../stores/mavlinkStore';

  import { setFlightMode, setPositionLocal } from '../lib/mavlink-client';
  import { isGuidedLabel } from '../lib/flight-modes';

  const MOVE_STEP_M = 10;

  let altitude: number = $derived($mavAltitudeStore);

  let mavMode = $derived($mavModeStore);

  async function nudge(x: number, y: number) {
    if (!isGuidedLabel(mavMode)) await setFlightMode('GUIDED');
    await setPositionLocal(x, y, -altitude);
  }
</script>

<div class="dpad-container relative flex items-center justify-center w-48 h-48">
  <nav class="d-pad relative">
    <button class="up" aria-label="Move north" title="Move north {MOVE_STEP_M} m (world frame)" onclick={() => nudge(MOVE_STEP_M, 0)}>
      <i class="fas fa-chevron-up"></i>
    </button>
    <button class="right" aria-label="Move east" title="Move east {MOVE_STEP_M} m (world frame)" onclick={() => nudge(0, MOVE_STEP_M)}>
      <i class="fas fa-chevron-right"></i>
    </button>
    <button class="down" aria-label="Move south" title="Move south {MOVE_STEP_M} m (world frame)" onclick={() => nudge(-MOVE_STEP_M, 0)}>
      <i class="fas fa-chevron-down"></i>
    </button>
    <button class="left" aria-label="Move west" title="Move west {MOVE_STEP_M} m (world frame)" onclick={() => nudge(0, -MOVE_STEP_M)}>
      <i class="fas fa-chevron-left"></i>
    </button>
    <div class="center-circle">
      <span class="move-text" title="Arrows move the vehicle in world frame: North, East, South, West">N/E/S/W</span>
    </div>
  </nav>
</div>

<style>
  .dpad-container {
    width: fit-content;
    margin: auto;
  }

  .d-pad {
    position: relative;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: var(--tertiaryColor);
    border: 4px solid var(--secondaryColor);
    overflow: hidden;
  }

  .up, .down, .left, .right {
    width: 30%;
    height: 30%;
    transform: translate(-50%) rotate(45deg);
  }

  .d-pad button {
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #ffffff;
    font-size: 24px;
    transition: all 0.2s ease;
  }

  .d-pad button i {
    transform: rotate(-45deg);
  }

  .d-pad button.up {
    top: 0;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
  }

  .d-pad button.right {
    top: 50%;
    right: 0;
    transform: translateY(-50%) rotate(45deg);
  }

  .d-pad button.down {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
  }

  .d-pad button.left {
    top: 50%;
    left: 0;
    transform: translateY(-50%) rotate(45deg);
  }

  .d-pad button:hover.up {
    top: -5px;
  }

  .d-pad button:hover.right {
    right: -5px;
  }

  .d-pad button:hover.down {
    bottom: -5px;
  }

  .d-pad button:hover.left {
    left: -5px;
  }

  .d-pad button:hover {
    color: #4e94f7;
  }

  .center-circle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 60px;
    height: 60px;
    background-color: var(--primaryColor);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .move-text {
    font-size: 10pt;
    color: var(--fontColor);
  }
  
  /* Mobile Styles */
  @media (max-width: 990px) {
    .dpad-container {
      width: auto;
    }

    .d-pad {
      width: 150px;
      height: 150px;
    }

    .d-pad button {
      font-size: 20px;
    }

    .center-circle {
      width: 50px;
      height: 50px;
    }

    .move-text {
      font-size: 1rem;
    }
  }
</style>
