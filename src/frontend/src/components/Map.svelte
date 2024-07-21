<script>
  import { onMount } from 'svelte';
  let map;

  onMount(async () => {
    if (typeof window !== 'undefined') {
      const L = await import('leaflet');
      const leaflet = L.default;

      map = leaflet.map('map').setView([51.506, -0.09], 13);

      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      }).addTo(map);

      leaflet.marker([51.505, -0.09]).addTo(map)
        // .bindPopup('Drone is here.')
        // .openPopup();
    }
  });
</script>

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

<div class="map-container bg-[#1c1c1e] text-white rounded-lg h-48 w-48 p-1">
  <div id="map" class="relative h-full bg-gray-700 rounded-lg"></div>
  <div class="absolute bottom-0 left-0 bg-gray-800 text-white p-2 rounded-tr-lg rounded-bl-lg z-[1000] transform translate-x-1 -translate-y-1">Map View</div>
</div>
