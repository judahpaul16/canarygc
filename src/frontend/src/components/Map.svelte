<script lang="ts">
  import { onMount } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { mapStore, markersStore, polylinesStore, mapTypeStore, mapTileLayerStore } from '../stores/mapStore';
  import { mavLocationStore, mavHeadingStore, mavAltitudeStore } from '../stores/mavlinkStore';
  import {
    missionPlanActionsStore,
    type MissionPlanActions,
    missionIndexStore
  } from '../stores/missionPlanStore';
  import { get, writable } from 'svelte/store';
  import Modal from './Modal.svelte';
  import { LeafletMapManager } from '../lib/leaflet-utils';
  import type * as L from 'leaflet';

  export let hideOverlay: boolean = false;
  export let mavLocation: L.LatLng | { lat: number; lng: number };
  export let id: string | null = null;
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';

  let mapManager: LeafletMapManager;
  let leafletMap: L.Map | null = null;
  let mapType: string = get(mapTypeStore);
  let currentTileLayer: L.TileLayer | null = get(mapTileLayerStore);
  let zoom = 18;
  const lockViewStore = writable(true);

  let actions: MissionPlanActions = {};
  let action_types = [
    'NAV_WAYPOINT', 'NAV_SPLINE_WAYPOINT', 'NAV_TAKEOFF', 'NAV_RETURN_TO_LAUNCH', 'NAV_GUIDED_ENABLE', 'NAV_LAND',
    'NAV_LOITER_TIME', 'NAV_LOITER_TURNS', 'NAV_LOITER_UNLIM', 'NAV_PAYLOAD_PLACE', 'DO_WINCH', 'DO_GRIPPER', 'DO_SET_CAM_TRIGG_DIST',
    'DO_SET_SERVO', 'DO_REPEAT_SERVO', 'DO_DIGICAM_CONFIGURE', 'DO_DIGICAM_CONTROL', 'DO_FENCE_ENABLE',
    'DO_ENGINE_CONTROL', 'CONDITION_DELAY', 'CONDITION_CHANGE_ALT', 'CONDITION_DISTANCE', 'CONDITION_YAW'
  ];
  let action_markers = [
    'map/waypoint.png', 'map/spline-waypoint.png', 'map/takeoff.png', 'map/rtl.png', 'map/guided_enable.png', 'map/land.png',
    'map/loiter.png', 'map/loiter.png', 'map/loiter.png', 'map/do_winch.png', 'map/do_winch.png', 'map/gripper.png', 'map/camera.png',
    'map/do_set_servo.png', 'map/do_repeat_servo.png', 'map/camera.png', 'map/camera.png', 'map/do_fence_enable.png',
    'map/do_engine_control.png', 'map/delay.png', 'map/condition_change_alt.png', 'map/condition_distance.png', 'map/condition_yaw.png'
  ];
  let icons: L.Icon[] = [];
  let markers: Map<number, L.Marker> = get(markersStore); // Map to keep track of markers
  let polylines: Map<string, L.Polyline> = get(polylinesStore); // Map to keep track of polylines
  let mavHeading: number = 0;
  let mavMarker: L.Marker | null = null;
  let isDragging = false;
  let darkMode = get(darkModeStore);
  
  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';
  $: lockView = $lockViewStore;

  $: leafletMap = $mapStore;
  $: mapType = $mapTypeStore;
  $: currentTileLayer = $mapTileLayerStore;
  $: mavHeading = $mavHeadingStore,
        updateMAVMarker();
  $: mavLocation = $mavLocationStore,
        updateMAVMarker();

  $: actions = $missionPlanActionsStore,
    removeAllMarkers(),
    updateMAVMarker(),
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
      await import('leaflet');

      // Create map manager
      mapManager = new LeafletMapManager({
        initialLocation: mavLocation,
        zoom: zoom,
        mapType: mapType as 'openstreetmap' | 'satellite'
      });

      // Initialize map
      leafletMap = mapManager.initializeMap(id !== null ? id : 'map');

      // Create icons
      icons = action_markers.map((marker) => 
        mapManager.createIcon({ iconUrl: marker })
      );

      // Initial map updates
      Object.keys(actions).forEach((index) => {
        updateMap(Number(index));
      });
    } catch (error) {
      console.error('Map initialization failed', error);
    }

    // Event listeners for dragging and zoom
    document.addEventListener('mousedown', () => { isDragging = true });
    document.addEventListener('mouseup', () => { isDragging = false });
    document.addEventListener('touchstart', () => { isDragging = true});
    document.addEventListener('touchend', () => { isDragging = false });

    // Fullscreen event
    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 1000);
    });

    // Dark mode and background handling
    if (darkMode) {
      if (mapType !== 'satellite') document.getElementById('map')!.classList.add('dark');
      document.querySelector('.bg')!.setAttribute('style', "background: url('bg-map.webp') no-repeat center center fixed");
      primaryColorStore.set('#1c1c1e');
    } else {
      document.querySelector('.bg')!.setAttribute('style', "background: url('bg-map-light.webp') no-repeat center center fixed");
      primaryColorStore.set('#ffffff');
    }

    // Location display setup
    const locationDisplay = document.querySelector('#location-display')!;
    function updateLocationDisplay() {
      locationDisplay.textContent = `MAV Location: ${mavLocation.lat.toFixed(6)}°, ${mavLocation.lng.toFixed(6)}°, Yaw Angle: ${mavHeading}°, Altitude: ${get(mavAltitudeStore)}m`;
    }
    updateLocationDisplay();
    mavLocationStore.subscribe(location => {
      mavLocation = location;
      updateLocationDisplay();
    });

    // Map click event for adding waypoints
    leafletMap.on('click', (e: L.LeafletMouseEvent) => {
      if (Object.keys(actions).length > 1) {
        const { lat, lng: lon } = e.latlng;
        const index = Object.keys(actions).length;
        const action = { 
          type: 'NAV_WAYPOINT', 
          lat, 
          lon, 
          alt: null, 
          notes: '', 
          param1: null, 
          param2: null, 
          param3: null, 
          param4: null 
        };
        actions[index] = action;
        missionPlanActionsStore.set(actions);
        updateMap(index);
      }
    });

    mapStore.set(leafletMap);
    mavLocationStore.set(mavLocation);
  });

  function toggleMap() {
    if (!mapManager || !leafletMap) return;

    const newMapType = mapType === 'satellite' ? 'openstreetmap' : 'satellite';
    mapType = newMapType;
    mapTypeStore.set(newMapType);

    // Update tile layer using LeafletMapManager
    currentTileLayer = mapManager.setTileLayer(newMapType);
    mapTileLayerStore.set(currentTileLayer);

    // Update map styling
    let map = document.getElementById('map')!;
    if (newMapType === 'openstreetmap') {
      if (darkMode) map.classList.add('dark');
      map.classList.remove('satellite');
    } else {
      map.classList.remove('dark');
      map.classList.add('satellite');
    }
  }

  function toggleLockView() {
    lockView = !lockView;
    lockViewStore.set(lockView);
  }

  function toggleFullScreen(element: HTMLElement) {
    if (window.location.href.includes('dashboard')) hideOverlay = !hideOverlay;
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
    if (!mapManager || !leafletMap) return;

    markers.forEach((marker) => {
      // not the first marker
      if (marker.getLatLng() !== mavLocation) {
        mapManager.removeLayer(marker);
      }
    });
    markers.clear();

    polylines.forEach(polyline => {
      mapManager.removeLayer(polyline);
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
        mapManager?.removeLayer(polyline);
        polylines.delete(key);
      }
    });
  }

  function removePolyline(start: L.LatLng, end: L.LatLng) {
    const key = generatePolylineKey(start, end);
    const polylineToRemove = polylines.get(key);

    if (polylineToRemove) {
      mapManager?.removeLayer(polylineToRemove);
      polylines.delete(key);
    }
  }

  function addPolyline(start: L.LatLng, end: L.LatLng) {
    if (!mapManager) return;

    const key = generatePolylineKey(start, end);
    removePolyline(start, end); // Ensure no old polyline is left

    const polyline = mapManager.addPolyline(start, end);
    polylines.set(key, polyline);
  }

  function generatePolylineKey(start: L.LatLng, end: L.LatLng): string {
    const startLatLng = [start.lat, start.lng].join(',');
    const endLatLng = [end.lat, end.lng].join(',');
    return [startLatLng, endLatLng].sort().join('-'); // Ensure consistent ordering
  }

  async function updateMap(index: number) {
    if (!mapManager || !leafletMap) return;

    // Retrieve the action details using the index
    const action = actions[index];
    
    // Remove existing marker if it exists
    if (markers.has(index)) {
      mapManager.removeLayer(markers.get(index)!);
    }

    if (index !== 0) {
      // Add new marker with updated info if leafletMap and action are valid
      if (action) {
        const { type, lat, lon } = action;
        const iconIndex = action_types.indexOf(type);
        
        if (!isNaN(lat) && !isNaN(lon) && iconIndex >= 0) {
          const marker = mapManager.addMarker(
            [lat, lon], 
            icons[iconIndex], 
            `${index} - ${type}`
          );
          
          if (!hideOverlay) {
            marker.openPopup();
          }
          markers.set(index, marker);
        }
      }

      // Remove polylines connected to this action and update all polylines
      removeConnectedPolylines(index);
      updateMarkersAndPolylines();
    }
  }

  function updateMarkersAndPolylines(reindex: boolean = false) {
    if (!mapManager || !leafletMap) return;

    if (reindex) {
      // Remove last marker
      const lastMarker = markers.get(Object.keys(actions).length + 1);
      if (lastMarker) {
        mapManager.removeLayer(lastMarker);
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
      mapManager.removeLayer(polyline);
    });
    polylines.clear();

    const markerEntries = Array.from(markers.entries()).sort((a, b) => a[0] - b[0]); // Ensure order by index

    for (let i = 0; i < markerEntries.length - 1; i++) {
      const [currentIndex, currentMarker] = markerEntries[i];
      const [nextIndex, nextMarker] = markerEntries[i + 1];
      let [prevIndex, prevMarker] = markerEntries[i];
      if (i > 0) [prevIndex, prevMarker] = markerEntries[i - 1];
      
      if (currentMarker && nextMarker && currentIndex >= get(missionIndexStore)) {
        let currentLatLng = currentMarker.getLatLng();
        let nextLatLng = nextMarker.getLatLng();
        addPolyline(currentLatLng, nextLatLng);
      }
      if (currentIndex < get(missionIndexStore) && prevMarker) {
        removePolyline(prevMarker.getLatLng(), currentMarker.getLatLng());
      }
    }

    if (markerEntries.length > 0) {
      if (get(mapStore)) {
        let mavLocation = get(mavLocationStore)!;
        let firstUnreachedMarker = markerEntries.find(([index]) => index === get(missionIndexStore));
        if (mavLocation && firstUnreachedMarker) {
          addPolyline(mavLocation as L.LatLng, firstUnreachedMarker[1].getLatLng());
        }
      }
    }
  }

  function updateMAVMarker() {
    if (!mapManager || !leafletMap || !mavLocation) return;

    const img = new Image();
    img.src = '/map/here.png';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.translate(img.width / 2, img.height / 2);
        ctx.rotate((mavHeading) * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        // Update MAV marker using LeafletMapManager
        mavMarker = mapManager.updateMavMarker(
          mavLocation, 
          mavHeading, 
          canvas.toDataURL()
        );

        updateMarkersAndPolylines();
        
        if (lockView && mavLocation) {
          mapManager.flyTo(mavLocation);
        }
      }
    };
  }
</script>

<style lang="css">
  @import url('https://unpkg.com/leaflet@1.7.1/dist/leaflet.css');
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
  }

  #map {
    height: 100%;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  #map {
    display: block;
  }

  #map-toggle {
    z-index: 10;
    background-color: var(--secondaryColor);
    border: 2px solid var(--primaryColor);
  }

  #map-toggle > * {
    color: var(--fontColor);
  }

  .map-btn {
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 2px solid var(--primaryColor);
    opacity: 0.95;
  }

  .map-btn:hover {
    opacity: 0.7;
  }
  #location-display {
    position: absolute;
    bottom: 10px;
    left: 10px;
    background: rgba(255,255,255,0.8);
    padding: 5px;
    border-radius: 4px;
    z-index: 1000;
  }
</style>

<div class="map-container" style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};">
  <div id={id !== null ? id : 'map'} class="relative h-full rounded-2xl z-0"></div>
  <button class="map-btn absolute top-[3.8rem] right-2 text-[#ffffff] bg-opacity-75 p-2 {lockView ? 'px-[15px]' : 'px-[13px]'} rounded-full" on:click={toggleLockView}> 
    <i class="fas {lockView ? 'fa-lock' : 'fa-lock-open'}"></i>
  </button>
  <button class="map-btn absolute top-3 right-2 text-[#ffffff] bg-opacity-75 p-2 px-[14px] rounded-full" on:click={handleFullScreen}>
    <i class="fas fa-expand"></i>
  </button>
  <label id="map-toggle" class="flex justify-center cursor-pointer my-2 absolute top-1 right-2 left-2 w-fit m-auto rounded-3xl p-2 pl-3 text-sm items-center" style={!hideOverlay ? 'display: flex;' : 'display: none;'}>
    <input type="checkbox" value="" class="sr-only peer" on:click={toggleMap}>
    <span class="text-[#ffffff]"><i class="fas fa-map"></i>&nbsp;&nbsp;{mapType === 'openstreetmap' ? 'OpenStreetMap' : 'Satellite'}</span>
    <div class="relative w-11 h-6 ml-3 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-[#6ac3ff] peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#2b7c3f]"></div>
  </label>
  <div id="location-display" class="text-black text-sm" style={!hideOverlay ? 'display: block;' : 'display: none;'}></div>
</div>
