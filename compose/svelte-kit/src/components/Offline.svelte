<svelte:options accessors={true} />
<script lang="ts">
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';

  let isMinimized = false;

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = darkMode ? $tertiaryColorStore : $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? "#ffffff" : "#000000";

  function toggleMinimize() {
    isMinimized = !isMinimized;
  }
</script>

<div class="fixed z-50 transition-all duration-300"
  class:inset-0={!isMinimized}
  class:bottom-4={isMinimized}
  class:left-4={isMinimized}
  class:flex={!isMinimized}
  class:items-center={!isMinimized}
  class:justify-center={!isMinimized}
  style="background-color: {isMinimized ? 'transparent' : '#00000080'}; --primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
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
              on:click={toggleMinimize}
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
                  You are currently offline. Please check your internet connection and try again.
              </p>
          </div>
          <div class="px-4 py-2 flex justify-center">
              <button class="px-2 py-1 mb-2 text-center bg-slate-400 hover:bg-[#ff3333] text-white rounded-lg" on:click={() => window.location.reload()}>
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
</style>