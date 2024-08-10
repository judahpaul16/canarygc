<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { mavLocationStore } from '../stores/mapStore';
  
  export let mavLocation: L.LatLng | { lat: number; lng: number };;

  $: mavLocation = $mavLocationStore;

  let interval: number | undefined;
  let currentLat = formatCoordinates(mavLocation.lat, true);
  let currentLong = formatCoordinates(mavLocation.lng, false);
  let heading = formatHeading(135);

  function formatCoordinates(decimalDegree: number, isLatitude: boolean) {
    const absDegree = Math.abs(decimalDegree);
    const degrees = Math.floor(absDegree);
    const minutes = Math.floor((absDegree - degrees) * 60);
    const seconds = ((absDegree - degrees - minutes / 60) * 3600).toFixed(2);
    const direction = isLatitude
      ? (decimalDegree < 0 ? 'S' : 'N')
      : (decimalDegree < 0 ? 'W' : 'E');
    
    return `${degrees}°${minutes}'${seconds}"${direction}`;
  }

  function formatHeading(heading: number) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((heading % 360) / 45) % 8);
    return `${heading}° ${directions[index]}`;
  }

  function updateCompass(newHeading: number) {
    const compassArrow = document.querySelector('.compass-arrow');
    const directionDegree = document.getElementById('direction-degree');
    const latLongElement = document.getElementById('lat-long');

    if (compassArrow instanceof HTMLElement && directionDegree instanceof HTMLElement) {
      compassArrow.style.transform = `translate(-50%, -50%) rotate(${newHeading}deg)`;
      directionDegree.textContent = formatHeading(newHeading);
      heading = String(newHeading);
    }

    if (latLongElement instanceof HTMLElement) {
      // Generate mock latitude and longitude
      currentLat = `${Math.floor(Math.random() * 90)}°${Math.floor(Math.random() * 60)}'${Math.floor(Math.random() * 60)}"N`;
      currentLong = `${Math.floor(Math.random() * 180)}°${Math.floor(Math.random() * 60)}'${Math.floor(Math.random() * 60)}"E`;
      latLongElement.textContent = `${currentLat} ${currentLong}`;
    }
  }

  onMount(() => {
    interval = setInterval(() => {
      const newHeading = Math.floor(Math.random() * 360);
      updateCompass(newHeading);
    }, 3000);
  });

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

<style>
  .compass-container {
    position: relative;
    width: 100px;
    height: 100px;
    margin-bottom: 1.5em;
    margin-top: 2em;
    padding: 0.5em;
  }

  .compass-circle {
    position: relative;
    width: 100%;
    height: 100%;
    border: 2px dashed white;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: auto;
  }

  .compass-arrow {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: 2em;
    color: red;
    transform: translate(-50%, -50%) rotate(0deg);
    transform-origin: center;
    transition: transform 1s cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  .north, .east, .south, .west {
    position: absolute;
    font-size: 1rem;
    font-weight: bold;
  }

  .north {
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
  }

  .east {
    top: 50%;
    right: -20px;
    transform: translateY(-50%);
  }

  .south {
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%);
  }

  .west {
    top: 50%;
    left: -20px;
    transform: translateY(-50%);
  }
</style>

<div class="compass bg-[#1c1c1e] text-white rounded-lg flex flex-col items-center justify-center h-full w-full overflow-auto p-4">
  <div id="direction-degree" class="bg-[#62bbff] p-2 text-black text-xs rounded-full">83° NE</div>
  <div class="compass-container">
    <div class="compass-circle">
      <i class="fas fa-arrow-up compass-arrow"></i>
    </div>
    <div class="north">N</div>
    <div class="east">E</div>
    <div class="south">S</div>
    <div class="west">W</div>
  </div>
  <div class="mt-2 text-center text-xs">
    <div id="lat-long">50°26'31"N 30°28'50"E</div>
  </div>
</div>
