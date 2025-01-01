<script lang="ts">
    import pkg from 'maplibre-gl';
    const { Popup } = pkg;
    import { MapContext } from 'svelte-maplibre';
    import { onMount } from 'svelte';
    import {
        mavLocationStore,
        mavHeadingStore,
        mavAltitudeStore
    } from '../stores/mavlinkStore';
    import { get } from 'svelte/store';
  
    const { map } = new MapContext(); // Access the shared map context
  
    export function createMapPopup() {
      let popupCreated = false;
  
      // Function to create the popup
      async function createPopup() {
        if (map && !popupCreated) {
          popupCreated = true;
          const location = get(mavLocationStore);
          map.flyTo({ center: location, zoom: 8 });
  
          new Popup({
            closeOnClick: false,
          })
            .setLngLat(location)
            .setHTML("<h3>You are approximately here!</h3>")
            .addTo(map);
        }
      }
  
      // Effect to initialize popup creation
      onMount(() => {
        createPopup();
      });
  
      // Return the API (optional, e.g., for testing or extensions)
      return {
        createPopup,
      };
    }
  </script>
  
  <style>
    :global(.map-popup) {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5); /* Optional: semi-transparent background */
      z-index: 1000; /* Ensure it covers other content */
    }
  </style>