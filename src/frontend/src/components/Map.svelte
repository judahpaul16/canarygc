<script lang="ts">
  import { onMount } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { mapStore, mavLocationStore } from '../stores/mapStore';

  export let hideOverlay: boolean = false;
  export let lat: number = 33.749;
  export let lon: number = -84.388;

  const apiKey = import.meta.env.VITE_ALTITUDE_ANGEL_API_KEY;

  let L: typeof import('leaflet');
  let altitudeAngelMap: any;
  let leafletMap: any;
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
      // Load and initialize Leaflet
      L = (await import('leaflet')).default;
      initializeLeafletMap();

      // Load and initialize Altitude Angel
      await loadScript('js/jquery-3.2.1.min.js');
      await loadScript('js/altitudeAngelMap.js');
      initializeAltitudeAngelMap();
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

      altitudeAngelMap = aa.initialize({
        target: 'aamap',
        baseUrl: 'https://dronesafetymap.com',
        authDetails: { apiKey },
        features: features,
      });
    } else {
      console.error('Altitude Angel Map not loaded');
    }
  }

  function initializeLeafletMap() {
    const icon = L.icon({
      iconUrl: 'map/here.png',
      iconSize: [45, 45],
      iconAnchor: [23, 45],
      popupAnchor: [0, -45],
      shadowSize: [41, 41]
    });
    leafletMap = L.map('map').setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {}).addTo(leafletMap);
    L.marker([lat, lon], {icon: icon}).addTo(leafletMap)
      .bindPopup('MAV is here');
    mapStore.set(leafletMap);
    mavLocationStore.set(L.latLng(lat, lon));
  }

  function toggleMap() {
    const altitudeAngelDiv = document.getElementById('aamap');
    const leafletDiv = document.getElementById('map');

    if (currentMap === 'altitudeAngel') {
      currentMap = 'leaflet';
      if (altitudeAngelDiv) altitudeAngelDiv.style.display = 'none';
      if (leafletDiv) leafletDiv.style.display = 'block';
    } else {
      currentMap = 'altitudeAngel';
      if (altitudeAngelDiv) altitudeAngelDiv.style.display = 'block';
      if (leafletDiv) leafletDiv.style.display = 'none';
    }
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
    position: absolute;
    top: 0;
    left: 0;
  }

  #aamap {
    display: none;
  }

  #map {
    display: block;
  }

  button {
    position: absolute;
    top: 2px;
    right: 2px;
    background-color: rgba(0, 0, 0, 0.75);
    color: white;
    border: none;
    border-radius: 50%;
    padding: 10px;
    cursor: pointer;
    z-index: 10;
  }

  button:hover {
    background-color: rgba(0, 0, 0, 0.9);
  }

  #map-toggle {
    z-index: 10;
  }
</style>

<div class="map-container">
  <div id="aamap" class="relative h-full"></div>
  <div id="map" class="relative h-full rounded-lg z-0"></div>
  <button on:click={handleFullScreen}>
    <i class="fas fa-expand"></i>
  </button>
  {#if !hideOverlay}
    <label id="map-toggle" class="flex justify-center cursor-pointer my-2 absolute top-1 right-2 left-2 w-fit m-auto bg-[#000000ba] rounded-3xl p-2 pl-3 text-sm items-center">
      <input type="checkbox" value="" class="sr-only peer" on:click={toggleMap}>
      <span class="text-white"><i class="fas fa-map"></i>&nbsp;&nbsp;{currentMap === 'altitudeAngel' ? 'Altitude Angel' : 'Leaflet'}</span>
      <div class="relative w-11 h-6 ml-3 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-[#61cd89] peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#d94d7c]"></div>
    </label>
  {/if}
</div>
