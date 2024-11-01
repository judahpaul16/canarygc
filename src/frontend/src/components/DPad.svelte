<script lang="ts">
  import { run } from 'svelte/legacy';

  import { mavModeStore, mavAltitudeStore } from '../stores/mavlinkStore';
  import { get } from 'svelte/store';
  import { primaryColorStore, tertiaryColorStore } from '../stores/customizationStore';

  let altitude: number = $state(get(mavAltitudeStore));

  let primaryColor = $derived($primaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let mavMode = $derived($mavModeStore);
  run(() => {
    altitude = $mavAltitudeStore;
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

<div class="dpad-container relative flex items-center justify-center w-48 h-48">
  <nav class="d-pad relative" style="--tertiaryColor: {tertiaryColor}">
    <button class="up" onclick={() => {
        if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
        setPositionLocal('10', '0', `-${altitude}`);
      }}>
      <i class="fas fa-chevron-up"></i>
    </button>
    <button class="right" onclick={() => {
        if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
        setPositionLocal('0', '10', `-${altitude}`);
      }}>
      <i class="fas fa-chevron-right"></i>
    </button>
    <button class="down" onclick={() => {
        if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
        setPositionLocal('-10', '0', `-${altitude}`);
      }}>
      <i class="fas fa-chevron-down"></i>
    </button>
    <button class="left" onclick={() => {
        if (mavMode !== 'GUIDED') sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`);
        setPositionLocal('0', '-10', `-${altitude}`);
      }}>
      <i class="fas fa-chevron-left"></i>
    </button>
    <div class="center-circle">
      <span class="move-text">Move</span>
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
