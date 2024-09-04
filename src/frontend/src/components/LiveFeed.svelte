<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import Modal from './Modal.svelte';
  import { onMount } from 'svelte';
  import { darkModeStore, primaryColorStore, secondaryColorStore, tertiaryColorStore } from '../stores/customizationStore';

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        new Modal({
          target: document.body,
          props: {
            title: 'Error',
            content: `Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
            isOpen: true,
            confirmation: false,
            notification: true,
          },
        });
      });
    } else {
      document.exitFullscreen();
    }
  }

  function handleFullScreen() {
    const liveFeedElement = document.querySelector('#live-feed-container > div');
    if (liveFeedElement instanceof HTMLElement) {
      toggleFullScreen(liveFeedElement);
    }
  }

  function initConnection() {
    // const ws = new WebSocket('ws://localhost:8554');
    // ws.onopen = () => {
    //   console.log('Connected to WebSocket server');
    // };
    // ws.onmessage = (event) => {
    //   const feed = document.querySelector('#live-feed');
    //   if (feed instanceof HTMLElement) {
    //     feed.innerHTML = event.data;
    //   }
    // };
    // ws.onclose = () => {
    //   console.log('Disconnected from WebSocket server');
    // };
    return;
  }

  onMount(() => {
    initConnection();
  });
</script>

<div id="live-feed-container" class="text-[#ffffff] rounded-2xl h-full relative"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --fontColor: {fontColor};"
>
  <div class="container w-full h-full relative">
    <img id="no-signal" src={darkMode ? 'no-signal.gif': 'no-signal-light.gif'} alt="No Signal" class="w-full h-full object-cover rounded-lg z-0" />
    <div id="live-feed" class="absolute top-0 w-full h-full object-cover rounded-lg z-1"></div>
    <div class="absolute top-0 left-0 bg-[#f24e4ecf] text-[#ffffff] px-2 py-1 rounded-br-lg rounded-lg rounded-bl-none rounded-tr-none">Live Feed</div>
    <div class="caution-text absolute bottom-0 left-0 bg-[#252525cf] px-2 py-1 rounded-tr-lg rounded-lg rounded-br-none rounded-tl-none">Use Caution: The feed may be slightly delayed.</div>
    <button class="absolute top-2 right-2 text-[#ffffff]bg-opacity-75 p-2 px-3 rounded-full" on:click={handleFullScreen}>
      <i class="fas fa-expand"></i>
    </button>
  </div>
</div>

<style>
  #live-feed-container {
    background-color: var(--primaryColor);
    border: 10px solid var(--primaryColor);
  }

  .caution-text {
    color: var(--fontColor);
    background-color: var(--primaryColor);
    border: 2px solid var(--secondaryColor);
    opacity: 0.75;
  }

  button {
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 2px solid var(--primaryColor);
    opacity: 0.75;
  }

  button:hover {
    opacity: 0.65;
  }
</style>