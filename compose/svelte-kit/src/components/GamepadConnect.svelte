<script lang="ts">
  import { firstGamepad } from '../lib/gamepad-control';

  let { onStart, onCancel }: { onStart: () => void; onCancel: () => void } = $props();

  let pad: Gamepad | null = $state(null);
  let axes: number[] = $state([0, 0, 0, 0]);
  let buttons: boolean[] = $state([]);

  // The browser only exposes a gamepad after it is connected and a button is
  // pressed, so the dialog polls until one appears and then previews its
  // live input as confirmation.
  $effect(() => {
    const timer = setInterval(() => {
      const p = firstGamepad();
      pad = p;
      if (p) {
        axes = [...p.axes];
        buttons = p.buttons.map((b) => b.pressed);
      }
    }, 100);
    return () => clearInterval(timer);
  });

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<div class="elevated-surface fixed inset-0 flex items-center justify-center z-50 bg-[#00000090] p-4 backdrop-blur-sm">
  <button type="button" aria-label="Close dialog" class="absolute inset-0 h-full w-full cursor-default" onclick={onCancel}></button>
  <div class="container relative z-10 rounded-2xl shadow-2xl w-full max-w-md" role="dialog" aria-modal="true">
    <div class="relative border-b" style="border-color: rgb(from var(--fontColor) r g b / 0.12);">
      <div class="px-5 py-3 text-lg font-semibold">Connect a gamepad</div>
      <button onclick={onCancel} aria-label="Close" class="absolute top-2.5 right-3 opacity-60 hover:opacity-100 text-2xl leading-none">&times;</button>
    </div>
    <div class="px-5 py-4">
      <ol class="steps">
        <li>
          <i class="fas fa-plug"></i>
          Plug the gamepad in over USB, or pair it through your system's Bluetooth settings.
        </li>
        <li>
          <i class="fas fa-gamepad"></i>
          Press any button on it so the browser can see it.
        </li>
      </ol>
      {#if pad}
        <div class="status detected">
          <i class="fas fa-circle-check"></i>
          <span>{pad.id}</span>
        </div>
        <div class="sticks">
          <div class="stick-wrap">
            <div class="stick">
              <div class="dot" style="transform: translate({axes[0] * 14}px, {axes[1] * 14}px)"></div>
            </div>
            <span class="stick-label">Throttle / Yaw</span>
          </div>
          <div class="stick-wrap">
            <div class="stick">
              <div class="dot" style="transform: translate({(axes[2] ?? 0) * 14}px, {(axes[3] ?? 0) * 14}px)"></div>
            </div>
            <span class="stick-label">Pitch / Roll</span>
          </div>
        </div>
        <div class="btn-lights">
          {#each buttons.slice(0, 10) as pressed, i (i)}
            <span class="light {pressed ? 'on' : ''}"></span>
          {/each}
        </div>
        <p class="hint">Move the sticks and press buttons to confirm the input reaches the browser.</p>
      {:else}
        <div class="status waiting">
          <i class="fas fa-circle-notch fa-spin"></i>
          <span>Waiting for a gamepad&hellip;</span>
        </div>
      {/if}
    </div>
    <div class="flex justify-end px-4 py-2 border-t" style="border-color: rgb(from var(--fontColor) r g b / 0.12);">
      <button
        type="button"
        disabled={!pad}
        onclick={onStart}
        class="bg-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 mr-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Start flying
      </button>
      <button type="button" onclick={onCancel} class="bg-gray-500 px-4 py-2 rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400">Cancel</button>
    </div>
  </div>
</div>

<style>
  .container {
    color: var(--fontColor);
    background-color: var(--secondaryColor);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    font-size: 0.9rem;
  }

  .steps li {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }

  .steps i {
    width: 1.1rem;
    text-align: center;
    color: #4e94f7;
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .status.waiting {
    opacity: 0.7;
  }

  .status.detected i {
    color: #61cd89;
  }

  .status.detected span {
    max-width: 20rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sticks {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    margin-top: 0.9rem;
  }

  .stick-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }

  .stick {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.5rem;
    height: 3.5rem;
    border: 2px solid var(--tertiaryColor);
    border-radius: 9999px;
  }

  .dot {
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 9999px;
    background-color: #61cd89;
  }

  .stick-label {
    font-size: 0.7rem;
    opacity: 0.7;
  }

  .btn-lights {
    display: flex;
    justify-content: center;
    gap: 0.3rem;
    margin-top: 0.8rem;
  }

  .light {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 0.15rem;
    background-color: var(--tertiaryColor);
  }

  .light.on {
    background-color: #61cd89;
  }

  .hint {
    margin-top: 0.7rem;
    text-align: center;
    font-size: 0.75rem;
    opacity: 0.6;
  }
</style>
