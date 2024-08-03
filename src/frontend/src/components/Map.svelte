<script lang="ts">
  import { onMount } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';

  export let hideOverlay: boolean = false;

  const apiKey = import.meta.env.VITE_ALTITUDE_ANGEL_API_KEY;

  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script ${src}`));
      document.head.appendChild(script);
    });
  };

  onMount(async () => {
    try {
      await loadScript('js/jquery-3.2.1.min.js');
      await loadScript('js/altitudeAngelMap.js');

      const { aa } = window as any;
      if (typeof aa !== 'undefined') {
        const features = [
          aa.features.displayUserLocation,
          aa.features.currentLocationOnStart,
          ...(hideOverlay ? [
            aa.features.hideMapTileSelector,
            aa.features.hideMenuPanel,
            aa.features.hideMenuBar,
            aa.features.hideSearch,
            aa.features.hideUTMStatusIcons
          ] : [])
        ];

        aa.initialize({
          target: 'aamap',
          baseUrl: 'https://dronesafetymap.com',
          authDetails: {
            apiKey: apiKey,
          },
          features: features,
        });
      } else {
        console.error('Altitude Angel Map not loaded');
      }
    } catch (error) {
      console.error('Script loading failed', error);
    }
  });

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function handleFullScreen() {
    const el = document.querySelector('.map-container');
    if (el instanceof HTMLElement) {
      toggleFullScreen(el);
    }
  }
</script>

<style>
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
  }

  #aamap {
    width: 100%;
    height: 100%;
  }
</style>

<div class="map-container text-white rounded-lg h-48 w-48 relative">
  <div id="aamap" class="relative h-full"></div>
  <button class="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-75 p-2 px-3 hover:bg-blue-400 rounded-full" on:click={handleFullScreen}>
    <i class="fas fa-expand"></i>
  </button>
</div>