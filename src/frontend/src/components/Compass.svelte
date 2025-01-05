<script lang="ts">
  import { onMount } from 'svelte';
  import { mavLocationStore, mavHeadingStore } from '../stores/mavlinkStore';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';
  
  interface Props {
    mavLocation: L.LatLng | { lat: number; lng: number };
  }

  let { mavLocation = $bindable() }: Props = $props();
  let heading: string = $state();
  let currentLat: string = $state();
  let currentLong: string = $state();

  onMount(() => {
    const updateHeading = (newHeading: number) => {
      updateCompass(newHeading);
    };

    mavHeadingStore.subscribe(updateHeading);
  });

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
    return `${heading}° ${directions[index] === undefined ? 'N' : directions[index]}`;
  }

  function updateCompass(newHeading: number) {
    if (typeof document !== 'undefined') {
      const compassArrow = document.querySelector('.compass-arrow');
      const directionDegree = document.getElementById('heading');
      const latLongElement = document.getElementById('lat-long');

      if (compassArrow instanceof HTMLElement && directionDegree instanceof HTMLElement) {
        compassArrow.style.transform = `translate(-50%, -50%) rotate(${newHeading}deg)`;
        directionDegree.textContent = formatHeading(newHeading);
        heading = formatHeading(newHeading);
      }

      if (latLongElement instanceof HTMLElement) {
        latLongElement.textContent = `${currentLat} ${currentLong}`;
      }
    }
  }
  let darkMode = $derived($darkModeStore);
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');
  
  $effect.pre(() => {
    mavLocation = $mavLocationStore;
    currentLat = formatCoordinates(mavLocation.lat, true);
    currentLong = formatCoordinates(mavLocation.lng, false);
  });

  $effect(() => {
    updateCompass($mavHeadingStore);
  });

  $effect(() => {
    heading = formatHeading($mavHeadingStore);
  });
</script>

<div class="compass rounded-2xl flex flex-col items-center justify-center h-full w-full overflow-auto p-4"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <div id="heading" class="bg-[#62bbff] p-2 text-[#000000] text-xs rounded-full">{heading}</div>
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
      <div id="lat-long">{currentLat} {currentLong}</div>
    </div>
</div>

<style>
  #heading {
    color: var(--primaryColor);
  }

  .compass {
    color: var(--fontColor);
    background-color: var(--primaryColor);
  }

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
    border: 2px dashed rgb(from var(--fontColor) r g b / 0.3);
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