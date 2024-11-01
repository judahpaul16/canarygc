<svelte:options runes={true} />
<script lang="ts">
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';

  let darkMode = $derived($darkModeStore);
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived(darkMode ? $tertiaryColorStore : $secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? "#ffffff" : "#000000");
</script>

<div class="fixed inset-0 flex items-center justify-center z-50 bg-[#00000080]"
style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
    <div class="container rounded-2xl shadow-lg max-w-sm w-full">
        <div class="relative">
            <div class="px-4 pt-4 pb-2 text-lg text-center font-semibold">
                <i class="fas fa-circle-notch fa-spin mr-1"></i>
                Reconnecting...
            </div>
        </div>
        <div class="px-4 py-2 text-center">
            <p class="text-sm">
                You are currently offline. Please check your internet connection and try again.
            </p>
        </div>
        <div class="px-4 py-2 flex justify-center">
            <button class="px-2 py-1 mb-2 text-center bg-slate-400 hover:bg-[#ff3333] text-white rounded-lg" onclick={() => window.location.reload()}>
                Refresh Window
            </button>
        </div>
    </div>
</div>

<style>
  .container {
    color: var(--fontColor);
    background-color: var(--primaryColor);
  }
</style>
