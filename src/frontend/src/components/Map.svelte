<script lang="ts">
  import { onMount } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';

  let map;

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function handleMapFullScreen() {
    const mapElement = document.querySelector('.map-container');
    if (mapElement instanceof HTMLElement) {
      toggleFullScreen(mapElement);
    }
  }

  onMount(async () => {
    if (typeof window !== 'undefined') {
      const L = await import('leaflet');
      const leaflet = L.default;

      map = leaflet.map('map').setView([51.506, -0.09], 13);

      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {}).addTo(map);

      leaflet.marker([51.505, -0.09]).addTo(map);
    }
  });
</script>

<div class="map-container bg-[#1c1c1e] text-white rounded-lg h-48 w-48 p-1 relative">
  <div id="map" class="relative h-full bg-gray-700 rounded-lg"></div>
  <div class="absolute bottom-0 left-0 bg-gray-800 text-white p-2 rounded-tr-lg rounded-bl-lg z-[1000] transform translate-x-1 -translate-y-1">Map View</div>
  <button class="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-75 p-2 px-3 hover:bg-blue-400 rounded-full z-[1000]" on:click={handleMapFullScreen}>
    <i class="fas fa-expand"></i>
  </button>
</div>

<style>
  @import url('https://unpkg.com/leaflet@1.7.1/dist/leaflet.css');

  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
  }

  #map {
    height: 100%;
    width: 100%;
    border-radius: 1rem;
  }
</style>
