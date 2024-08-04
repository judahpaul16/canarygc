<script lang="ts">
  import { onMount } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';

  export let hideOverlay: boolean = false;

  const apiKey = import.meta.env.VITE_ALTITUDE_ANGEL_API_KEY;

  let currentMap: 'altitudeAngel' | 'leaflet' = 'leaflet'; // Default to Leaflet

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
      if (currentMap === 'altitudeAngel') {
        await loadScript('js/jquery-3.2.1.min.js');
        await loadScript('js/altitudeAngelMap.js');
        initializeAltitudeAngelMap();
      } else if (currentMap === 'leaflet') {
        const L = await import('leaflet');
        initializeLeafletMap(L.default);
      }
    } catch (error) {
      console.error('Script loading failed', error);
    }
  });

  function initializeAltitudeAngelMap() {
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
        authDetails: { apiKey },
        features: features,
      });

      setLocation(26.0558, -80.1437);
    } else {
      console.error('Altitude Angel Map not loaded');
    }
  }

  function initializeLeafletMap(leaflet: any) {
    const map = leaflet.map('map').setView([33.749, -84.388], 13);
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {}).addTo(map);
    leaflet.marker([33.749, -84.388]).addTo(map);
  }

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

  function toggleMap() {
    currentMap = currentMap === 'altitudeAngel' ? 'leaflet' : 'altitudeAngel';
    // Reinitialize map when toggling
    if (currentMap === 'altitudeAngel') {
      loadScript('js/altitudeAngelMap.js').then(initializeAltitudeAngelMap);
    } else {
      import('leaflet').then(L => initializeLeafletMap(L.default));
    }
  }
</script>

<style lang="css">
  @import url('https://unpkg.com/leaflet@1.7.1/dist/leaflet.css');
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
  }

  #aamap, #map {
    height: 100%;
    width: 100%;
  }
</style>

<div class="map-container text-white rounded-lg h-48 w-48 relative">
  {#if currentMap === 'altitudeAngel'}
    <div id="aamap" class="relative h-full"></div>
  {:else}
    <div id="map" class="relative h-full rounded-lg z-0"></div>
  {/if}
  <button class="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-75 p-2 px-3 hover:bg-blue-400 rounded-full" on:click={handleFullScreen}>
    <i class="fas fa-expand"></i>
  </button>
  {#if !hideOverlay}
    <label id="map-toggle" class="flex justify-center cursor-pointer my-2 absolute top-1 right-2 left-2 w-fit m-auto bg-[#000000ba] rounded-3xl p-2 pl-3 text-sm items-center">
      <input type="checkbox" value="" class="sr-only peer" on:click={toggleMap}>
      <span><i class="fas fa-map"></i>&nbsp;&nbsp;{currentMap === 'altitudeAngel' ? 'Altitude Angel' : 'Leaflet'}</span>
      <div class="relative w-11 h-6 ml-3 bg-gray-200 peer-focus:outline-none peer-focus:ring-4  rounded-full peer dark:bg-green-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
    </label>
  {/if}
</div>
