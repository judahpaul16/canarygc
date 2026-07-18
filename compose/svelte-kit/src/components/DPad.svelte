<script lang="ts">
  import { mavModeStore, mavAltitudeStore } from '../stores/mavlinkStore';

  import { setFlightMode, setPositionLocal, repositionRelative } from '../lib/mavlink-client';
  import { isGuidedLabel, isPX4 } from '../lib/flight-modes';
  import { m } from '$lib/paraglide/messages';

  const MOVE_STEP_M = 1;

  type Dir = 'up' | 'right' | 'down' | 'left';

  const TIPS: Record<Dir, string> = {
    up: m.dpad_move_north_tip({ step: MOVE_STEP_M }),
    right: m.dpad_move_east_tip({ step: MOVE_STEP_M }),
    down: m.dpad_move_south_tip({ step: MOVE_STEP_M }),
    left: m.dpad_move_west_tip({ step: MOVE_STEP_M })
  };

  // The arrow buttons are rotated 45 degrees, so a pseudo-element tooltip on
  // the button itself renders rotated; one tip element outside the rotated
  // frame shows above whichever arrow is hovered or focused.
  let tipDir: Dir | null = $state(null);

  let altitude: number = $derived($mavAltitudeStore);

  let mavMode = $derived($mavModeStore);

  async function nudge(x: number, y: number) {
    if (isPX4()) {
      await repositionRelative(x, y, 0);
      return;
    }
    if (!isGuidedLabel(mavMode)) await setFlightMode('GUIDED');
    await setPositionLocal(x, y, -altitude);
  }
</script>

<div class="dpad-container relative flex items-center justify-center w-48 h-48">
  <nav class="d-pad relative">
    <button
      class="up"
      aria-label={m.dpad_move_north()}
      onmouseenter={() => (tipDir = 'up')}
      onmouseleave={() => (tipDir = null)}
      onfocus={() => (tipDir = 'up')}
      onblur={() => (tipDir = null)}
      onclick={() => nudge(MOVE_STEP_M, 0)}
    >
      <i class="fas fa-chevron-up"></i>
    </button>
    <button
      class="right"
      aria-label={m.dpad_move_east()}
      onmouseenter={() => (tipDir = 'right')}
      onmouseleave={() => (tipDir = null)}
      onfocus={() => (tipDir = 'right')}
      onblur={() => (tipDir = null)}
      onclick={() => nudge(0, MOVE_STEP_M)}
    >
      <i class="fas fa-chevron-right"></i>
    </button>
    <button
      class="down"
      aria-label={m.dpad_move_south()}
      onmouseenter={() => (tipDir = 'down')}
      onmouseleave={() => (tipDir = null)}
      onfocus={() => (tipDir = 'down')}
      onblur={() => (tipDir = null)}
      onclick={() => nudge(-MOVE_STEP_M, 0)}
    >
      <i class="fas fa-chevron-down"></i>
    </button>
    <button
      class="left"
      aria-label={m.dpad_move_west()}
      onmouseenter={() => (tipDir = 'left')}
      onmouseleave={() => (tipDir = null)}
      onfocus={() => (tipDir = 'left')}
      onblur={() => (tipDir = null)}
      onclick={() => nudge(0, -MOVE_STEP_M)}
    >
      <i class="fas fa-chevron-left"></i>
    </button>
    <div class="center-circle" data-tip={m.dpad_world_frame()}>
      <span class="move-text">N/E/S/W</span>
    </div>
  </nav>
  {#if tipDir}
    <div class="dpad-tip dpad-tip-{tipDir}">{TIPS[tipDir]}</div>
  {/if}
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

  .dpad-tip {
    position: absolute;
    z-index: 60;
    padding: 0.25rem 0.6rem;
    border-radius: var(--radius-control);
    background-color: #3290e7;
    color: #ffffff;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
  }

  .dpad-tip-up {
    left: 50%;
    bottom: calc(100% + 2px);
    transform: translateX(-50%);
  }

  .dpad-tip-down {
    left: 50%;
    bottom: calc(30% + 6px);
    transform: translateX(-50%);
  }

  .dpad-tip-left {
    left: 15%;
    bottom: calc(65% + 6px);
    transform: translateX(-50%);
  }

  .dpad-tip-right {
    left: 85%;
    bottom: calc(65% + 6px);
    transform: translateX(-50%);
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
