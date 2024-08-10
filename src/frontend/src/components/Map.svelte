<script lang="ts">
  import { onMount } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { mapStore, mavLocationStore, markersStore, polylinesStore } from '../stores/mapStore';
  import { flightPlanTitleStore, flightPlanActionsStore } from '../stores/flightPlanStore';
  import { get } from 'svelte/store';
  import Modal from './Modal.svelte';

  export let hideOverlay: boolean = false;
  export let mavLocation: L.LatLng | { lat: number; lng: number };;

  const apiKey = import.meta.env.VITE_ALTITUDE_ANGEL_API_KEY;

  let L: typeof import('leaflet');
  let altitudeAngelMap: any;
  let leafletMap: any;
  let currentMap: 'altitudeAngel' | 'leaflet' = 'leaflet'; // Default to Leaflet

  let actions: {
      [key: number]: {
          type: string;
          lat: number;
          lon: number;
          altitude: number;
          notes: string;
          notify: boolean;
      };
  } = {};
  let action_types = [
    'WAYPOINT', 'SPLINE_WAYPOINT', 'TAKEOFF', 'RETURN_TO_LAUNCH', 'GUIDED_ENABLE', 'LAND',
    'LOITER_TIME', 'LOITER_TURNS', 'LOITER_UNLIM', 'PAYLOAD_PLACE', 'DO_WINCH', 'DO_SET_CAM_TRIGG_DIST',
    'DO_SET_SERVO', 'DO_REPEAT_SERVO', 'DO_DIGICAM_CONFIGURE', 'DO_DIGICAM_CONTROL', 'DO_FENCE_ENABLE',
    'DO_ENGINE_CONTROL', 'CONDITION_DELAY', 'CONDITION_CHANGE_ALT', 'CONDITION_DISTANCE', 'CONDITION_YAW'
  ];
  let action_markers = [
    'map/waypoint.png', 'map/spline-waypoint.png', 'map/takeoff.png', 'map/rtl.png', 'map/guided_enable.png', 'map/land.png',
    'map/loiter.png', 'map/loiter.png', 'map/loiter.png', 'map/payload_place.png', 'map/do_winch.png', 'map/camera.png',
    'map/do_set_servo.png', 'map/do_repeat_servo.png', 'map/camera.png', 'map/camera.png', 'map/do_fence_enable.png',
    'map/do_engine_control.png', 'map/delay.png', 'map/condition_change_alt.png', 'map/condition_distance.png', 'map/condition_yaw.png'
  ];
  let icons: L.Icon[] = [];
  let markers: Map<number, L.Marker> = new Map(); // Map to keep track of markers
  let polylines: Map<string, L.Polyline> = new Map(); // Map to keep track of polylines
  
  $: leafletMap = $mapStore;

  $: mavLocation = $mavLocationStore,
    markers.forEach((marker) => {
      if (marker.getLatLng() === mavLocation) {
        marker.setLatLng(mavLocation);
      }
    });

  $: actions = $flightPlanActionsStore,
    removeAllMarkers(),
    Object.keys(actions).forEach((index) => {
      updateMap(Number(index));
    });

  $: markers = $markersStore,
    Object.keys(actions).forEach((index) => {
      updateMap(Number(index));
    });

  $: polylines = $polylinesStore,
    Object.keys(actions).forEach((index) => {
      updateMap(Number(index));
    });

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
      mapStore.subscribe((value: L.Map | null) => {
        if (value) {
          leafletMap = value;
        }
      });
      initializeLeafletMap();

      // Load and initialize Altitude Angel
      await loadScript('js/jquery-3.2.1.min.js');
      await loadScript('js/altitudeAngelMap.js');
      initializeAltitudeAngelMap();
    } catch (error) {
      console.error('Script loading failed', error);
    }

    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 1000);
    });

    markersStore.subscribe((value) => {
      markers = value;
    });

    polylinesStore.subscribe((value) => {
      polylines = value;
    });
    
    icons = action_markers.map((marker) => {
      return L.icon({
        iconUrl: marker,
        iconSize: [45, 45],
        iconAnchor: [23, 45],
        popupAnchor: [0, -45],
        shadowSize: [41, 41]
      });
    });

    Object.keys(actions).forEach((index) => {
      updateMap(Number(index));
    });
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
    let lat = mavLocation.lat;
    let lon = mavLocation.lng;
    const icon = L.icon({
      iconUrl: 'map/here.png',
      iconSize: [45, 45],
      iconAnchor: [23, 45],
      popupAnchor: [0, -45],
      shadowSize: [41, 41]
    });
    leafletMap = L.map('map').setView([lat+0.002, lon], 13);
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
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 1000);
    } else {
      document.exitFullscreen();
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 1000);
    }
  }

  function handleFullScreen() {
    const el = document.querySelector('.map-container');
    if (el instanceof HTMLElement) {
      toggleFullScreen(el);
    }
  }

  function removeAllMarkers() {
    markers.forEach((marker) => {
      // not the first marker
      if (leafletMap?.hasLayer(marker) && marker.getLatLng() !== mavLocation) {
        leafletMap.removeLayer(marker);
      }
    });
    markers.clear();

    polylines.forEach(polyline => {
      if (leafletMap?.hasLayer(polyline)) {
        leafletMap.removeLayer(polyline);
      }
    });
    polylines.clear();
    markersStore.set(markers);
    polylinesStore.set(polylines);
  }
  
  function removeConnectedPolylines(index: number) {
    const connectedKeys = Array.from(polylines.keys()).filter(key => {
      const [startIndex, endIndex] = key.split('-').map(Number);
      return startIndex === index || endIndex === index;
    });

    connectedKeys.forEach(key => {
      const polyline = polylines.get(key);
      if (polyline) {
        if (leafletMap?.hasLayer(polyline)) {
          leafletMap.removeLayer(polyline);
        }
        polylines.delete(key);
      }
    });
  }

  function removePolyline(start: L.LatLng, end: L.LatLng) {
    const key = generatePolylineKey(start, end);
    const polylineToRemove = polylines.get(key);

    if (polylineToRemove) {
      if (leafletMap?.hasLayer(polylineToRemove)) {
        leafletMap.removeLayer(polylineToRemove);
      }
      polylines.delete(key);
    }
  }

  function addPolyline(start: L.LatLng, end: L.LatLng) {
    const key = generatePolylineKey(start, end);
    removePolyline(start, end); // Ensure no old polyline is left

    const latlngs: L.LatLngExpression[] = [start, end];
    const polyline = L.polyline(latlngs, { color: 'red' });
    leafletMap?.addLayer(polyline);

    polylines.set(key, polyline);
  }

  function generatePolylineKey(start: L.LatLng, end: L.LatLng): string {
    const startLatLng = [start.lat, start.lng].join(',');
    const endLatLng = [end.lat, end.lng].join(',');
    return [startLatLng, endLatLng].sort().join('-'); // Ensure consistent ordering
  }

  async function updateMap(index: number) {
    flightPlanActionsStore.subscribe((value) => {
      actions = value;
    });

    // Retrieve the action details using the index
    const action = actions[index];
    
    // Remove existing marker if it exists
    if (markers.has(index)) {
      leafletMap?.removeLayer(markers.get(index)!);
    }

    // Add new marker with updated info if leafletMap and action are valid
    if (L && leafletMap && action) {
      const { type, lat, lon } = action;
      const iconIndex = action_types.indexOf(type);
      
      if (!isNaN(lat) && !isNaN(lon) && iconIndex >= 0) {
        const marker = L.marker([lat, lon], { icon: icons[iconIndex] })
          .bindPopup(`${index} - ${type}`);
        leafletMap.addLayer(marker);
        marker.openPopup();
        markers.set(index, marker);
      }
    }

    // Remove polylines connected to this action and update all polylines
    removeConnectedPolylines(index);
    updateMarkersAndPolylines();
  }

  function updateMarkersAndPolylines(reindex: boolean = false) {
    if (reindex) {
      // Remove last marker
      const lastMarker = markers.get(Object.keys(actions).length + 1);
      if (lastMarker) {
        leafletMap?.removeLayer(lastMarker);
        markers.delete(Object.keys(actions).length + 1);
      }
      // Update the popup content for each marker
      markers.forEach((marker, index) => {
        const action = actions[index];
        marker.bindPopup(`${index} - ${action.type}`);
      });
    }

    // Clear existing polylines before recalculating
    polylines.forEach(polyline => {
      if (leafletMap?.hasLayer(polyline)) {
        leafletMap.removeLayer(polyline);
      }
    });
    polylines.clear();

    const markerEntries = Array.from(markers.entries()).sort((a, b) => a[0] - b[0]); // Ensure order by index

    for (let i = 0; i < markerEntries.length - 1; i++) {
      const [currentIndex, currentMarker] = markerEntries[i];
      const [nextIndex, nextMarker] = markerEntries[i + 1];
      
      if (currentMarker && nextMarker) {
        let currentLatLng = currentMarker.getLatLng();
        let nextLatLng = nextMarker.getLatLng();
        addPolyline(currentLatLng, nextLatLng);
      }
    }

    if (markerEntries.length > 0) {
      const [firstIndex, firstMarker] = markerEntries[0];
      if (get(mapStore)) {
        let mavLocation = get(mavLocationStore)!;
        let currentMarkerLatLng = firstMarker.getLatLng();
        if (mavLocation && currentMarkerLatLng) {
            addPolyline(mavLocation as L.LatLng, currentMarkerLatLng);
        }
      }
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

  #map-toggle {
    z-index: 10;
  }
</style>

<div class="map-container">
  <div id="aamap" class="relative h-full"></div>
  <div id="map" class="relative h-full rounded-lg z-0"></div>
  <button class="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-75 p-2 px-3 hover:bg-[#000000e6] rounded-full" on:click={handleFullScreen}>
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
