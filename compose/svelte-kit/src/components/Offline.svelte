<script lang="ts">

  let isMinimized = $state(false);
  let reconnecting = $state(false);
  function toggleMinimize() {
    isMinimized = !isMinimized;
  }

  // Forces the server to drop and redial the vehicle link, the usual cause of
  // a reconnecting fit, without reloading the app and losing session state.
  // The offline pill clears itself once heartbeats resume.
  async function reconnect() {
    reconnecting = true;
    try {
      await fetch('/api/mavlink/reconnect', { method: 'POST' });
    } catch {
      // The link poll keeps retrying regardless.
    } finally {
      setTimeout(() => (reconnecting = false), 2000);
    }
  }
</script>

<div class="elevated-surface fixed z-50 transition-all duration-300"
  class:inset-0={!isMinimized}
  class:bottom-4={isMinimized}
  class:left-4={isMinimized}
  class:flex={!isMinimized}
  class:items-center={!isMinimized}
  class:justify-center={!isMinimized}
  style="background-color: {isMinimized ? 'transparent' : '#00000080'};"
>
    <div class="container rounded-2xl shadow-lg transition-all duration-300"
      class:max-w-sm={!isMinimized}
      class:w-full={!isMinimized}
      class:w-64={isMinimized}
      class:brightness-125={isMinimized}
    >
        <div class="relative">
            <button
              class="absolute right-2 top-2 p-2 hover:bg-opacity-20 hover:bg-black rounded-full transition-colors"
              onclick={toggleMinimize}
              aria-label={isMinimized ? "Maximize" : "Minimize"}
            >
              {#if isMinimized}
                <i class="fas fa-angle-up"></i>
              {:else}
                <i class="fas fa-angle-down"></i>
              {/if}
            </button>
            <div class="p-4 pl-0 text-lg text-center font-semibold">
                <i class="fas fa-circle-notch fa-spin mr-1"></i>
                Reconnecting...
            </div>
        </div>
        {#if !isMinimized}
          <div class="px-4 py-2 text-center">
              <p class="text-sm">
                  The vehicle link dropped. Reconnect to redial it, or keep working from the last-known telemetry.
              </p>
          </div>
          <div class="px-4 pb-3 pt-1 flex flex-wrap justify-center gap-2">
              <button class="reconnect px-3 py-1.5 text-white rounded-lg font-semibold disabled:opacity-60" onclick={reconnect} disabled={reconnecting}>
                  <i class="fas {reconnecting ? 'fa-circle-notch fa-spin' : 'fa-rotate'} mr-1"></i>
                  {reconnecting ? 'Reconnecting...' : 'Reconnect'}
              </button>
              <button class="ghost px-3 py-1.5 rounded-lg" onclick={() => window.location.reload()}>
                  Refresh Window
              </button>
          </div>
        {/if}
    </div>
</div>

<style>
  .container {
    color: var(--fontColor);
    background-color: var(--primaryColor);
  }

  .reconnect {
    background-color: #3290e7;
  }
  .reconnect:hover:not(:disabled) {
    background-color: #4e9ff0;
  }

  .ghost {
    color: var(--fontColor);
    background-color: rgb(from var(--fontColor) r g b / 0.08);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.15);
    font-size: 0.85rem;
  }
  .ghost:hover {
    background-color: rgb(from var(--fontColor) r g b / 0.16);
  }
</style>