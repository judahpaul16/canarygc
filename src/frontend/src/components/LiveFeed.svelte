<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';
</script>

<div id="live-feed-container" class="text-[#ffffff] rounded-2xl h-full relative"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --fontColor: {fontColor};"
>
  <div class="container w-full h-full relative">
    <img id="no-signal" src={darkMode ? 'no-signal.gif': 'no-signal-light.gif'} alt="No Signal" class="absolute top-0 w-full h-full object-cover rounded-lg z-10" />
    <iframe id="live-feed" title="Live Feed" src={ typeof window !== 'undefined' ? `http://${window.location.host}:8889/cam1`  : ''} class="bg-black absolute top-0 w-full h-full object-cover rounded-lg z-0"></iframe>
    <div class="tab absolute top-2 left-2 bg-[#f24e4eb9] text-[#ffffff] text-md px-2 py-1 rounded-full z-20">Live Feed</div>
    <div class="caution-text opacity-[50%] text-md absolute top-2 right-2 bg-[#252525cf] px-2 py-1 rounded-full z-20">Use Caution: The feed may be slightly delayed.</div>
  </div>
</div>

<style>
  #live-feed-container {
    background-color: var(--primaryColor);
    border: 10px solid var(--primaryColor);
  }

  #live-feed-container:hover .caution-text {
    opacity: 1;
  }

  #no-signal {
    background-color: var(--primaryColor);
  }

  .tab {
    border: 2px solid #3d393980;
  }

  .caution-text {
    color: var(--fontColor);
    background-color: rgb(from var(--primaryColor) r g b / 75%);
    border: 2px solid rgb(from var(--secondaryColor) r g b / 75%);
  }
</style>