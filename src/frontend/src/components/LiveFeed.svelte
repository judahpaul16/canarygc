<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import Modal from './Modal.svelte';
  import { onMount } from 'svelte';

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
    const liveFeedElement = document.querySelector('#live-feed-container');
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
    //   const feed = document.querySelector('.feed');
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

<div id="live-feed-container" class="bg-[#1c1c1e] text-white rounded-lg h-full relative">
  <img src="no-signal.gif" alt="No Signal" class="w-full h-full object-cover rounded-lg z-0" />
  <div id="live-feed" class="absolute top-0 w-full h-full object-cover rounded-lg z-1"></div>
  <div class="absolute top-0 left-0 bg-[#f24e4ecf] text-white px-2 py-1 rounded-br-lg rounded-lg rounded-bl-none rounded-tr-none">Live Feed</div>
  <div class="absolute bottom-0 left-0 bg-[#252525cf] text-white px-2 py-1 rounded-tr-lg rounded-lg rounded-bl-none rounded-br-none rounded-tl-none">Use Caution: The feed may be slightly delayed.</div>
  <button class="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-75 p-2 px-3 hover:bg-[#000000e6] rounded-full" on:click={handleFullScreen}>
    <i class="fas fa-expand"></i>
  </button>
</div>
