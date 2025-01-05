<script lang="ts">
  import { onMount, mount } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import {
    mapStore,
    markersStore,
    polylinesStore,
    mapTypeStore,
    mapTileLayerStore,
    mapZoomStore,
    lockViewStore,
    threeDMapStore
  } from '../stores/mapStore';
  import { mavLocationStore, mavHeadingStore, mavAltitudeStore } from '../stores/mavlinkStore';
  import {
    missionPlanActionsStore,
    type MissionPlanActions,
    missionIndexStore
  } from '../stores/missionPlanStore';
  import { get } from 'svelte/store';
  import Modal from './Modal.svelte';
  import ThreeDMap from './3DMap.svelte';
  import pkg from 'maplibre-gl';
  const { Marker } = pkg;

  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';
  interface Props {
    hideOverlay?: boolean;
    mavLocation: L.LatLng | { lat: number; lng: number };
    id?: string | null;
  }

  let { hideOverlay = $bindable(false), mavLocation = $bindable(), id = null }: Props = $props();

  let L: typeof import('leaflet');
  let leafletMap: any = $state(get(mapStore));
  let threeDMap: any = $state(get(threeDMapStore));
  let mapType: string = $state(get(mapTypeStore));
  let currentTileLayer = $state(get(mapTileLayerStore));
  let zoom = $state(get(mapZoomStore));

  let actions: MissionPlanActions = $state({});
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
  let markers: Map<number, L.Marker> = $state(get(markersStore)); // Map to keep track of markers
  let polylines: Map<string, L.Polyline> = $state(get(polylinesStore)); // Map to keep track of polylines
  let markers3D: Map<number, any> = new Map();
  let polylines3D: string[] = [];
  let mavHeading: number = $state(0);
  let mavMarker: L.Marker;
  let isDragging = false;
  let darkMode = $state(get(darkModeStore));
  
  let lockView = $state(get(lockViewStore)); // Declare lockView with $state

  onMount(async () => {
    try {
      // Load and initialize Leaflet
      L = (await import('leaflet')).default;
      if (id !== null) initializeLeafletMap(id);
      else initializeLeafletMap();
    } catch (error) {
      console.error('Script loading failed', error);
    }

    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 1000);
    });

    icons = action_markers.map((marker) => {
      return L.icon({
        iconUrl: marker,
        iconSize: [45, 45],
        iconAnchor: [23, 40],
        popupAnchor: [0, -45],
        shadowSize: [41, 41]
      });
    });

    Object.keys(actions).forEach((index) => {
      updateMap(Number(index));
    });
    
    document.addEventListener('fullscreenchange', (e) => {
      if (!document.fullscreenElement && window.location.href.includes('dashboard')) hideOverlay = true;
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 1000);
    });
    document.addEventListener('mousedown', () => { isDragging = true });
    document.addEventListener('mouseup', () => { isDragging = false });
    document.addEventListener('touchstart', () => { isDragging = true});
    document.addEventListener('touchend', () => { isDragging = false });
    let zoomIn = document.querySelector('.leaflet-control-zoom-in');
    let zoomOut = document.querySelector('.leaflet-control-zoom-out');
    if (zoomIn) zoomIn.addEventListener('click', () => { updateZoom(1) });
    if (zoomOut) zoomOut.addEventListener('click', () => { updateZoom(-1) });
    let map = get(mapStore);
    map?.on('zoom', () => {
      mapZoomStore.set(map.getZoom());
    });
  });

  function updateZoom(delta: number) {
    zoom += delta;
    mapZoomStore.set(zoom);
  }

  function initializeLeafletMap(id: string = 'map') {
    let threedmap = document.getElementById('threedmap')!;
    if (threedmap) threedmap.style.display = 'none';
    leafletMap = L.map(id).setView(mavLocation, zoom);
    if (mapType.toLowerCase() === 'openstreetmap') {
      currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          minZoom: 0,
          maxZoom: 21,
        }).addTo(leafletMap);
      mapType = 'OpenStreetMap';
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    } else {
      currentTileLayer = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.png', {
          minZoom: 0,
          maxZoom: 21,
        }).addTo(leafletMap);
      mapType = 'Satellite';
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    }
    if (darkMode) {
      if (mapType.toLowerCase() !== 'satellite') document.getElementById('map')!.classList.add('dark');
      // @ts-ignore
      document.querySelector('.bg')!.style.background = "url('bg-map.webp') no-repeat center center fixed";
      primaryColorStore.set('#1c1c1e');
    } else {
      // @ts-ignore
      document.querySelector('.bg')!.style.background = "url('bg-map-light.webp') no-repeat center center fixed";
      primaryColorStore.set('#ffffff');
    }

    // @ts-ignore
    if (hideOverlay) Array.from(document.querySelectorAll('.map-btn i')).forEach((element) => element.style.fontSize = "small");
    
    updateMAVMarker();

    const locationDisplay = document.querySelector('#location-display')!;

    // Update location display when MAV position changes
    function updateLocationDisplay() {
        locationDisplay.textContent = `MAV Location: ${mavLocation.lat.toFixed(6)}°, ${mavLocation.lng.toFixed(6)}°, Yaw Angle: ${mavHeading}°, Altitude: ${get(mavAltitudeStore)}m`;
    }
    updateLocationDisplay();

    // Subscribe to MAV location changes
    mavLocationStore.subscribe(location => {
        mavLocation = location;
        updateLocationDisplay();
    });

    leafletMap.on('click', (e: L.LeafletMouseEvent) => {
      if (Object.keys(actions).length > 1) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        const index = Object.keys(actions).length;
        const action = { type: 'NAV_WAYPOINT', lat, lon, alt: null, notes: '', param1: null, param2: null, param3: null, param4: null };
        actions[index] = action;
        missionPlanActionsStore.set(actions);
        updateMap(index);
      }
    });

    mapStore.set(leafletMap);
    mavLocationStore.set(mavLocation);
  }

  function toggleMap() {
    if (currentTileLayer) {
        currentTileLayer.remove();
    }
    let map = document.getElementById('map')!;
    let threedmap = document.getElementById('threedmap')!;
    if (leafletMap && mapType.toLowerCase() === '3d') {
      map.style.display = 'block';
      threedmap.style.display = 'none';
      mapType = 'OpenStreetMap';
      if (darkMode) map.classList.add('dark');
      map.classList.remove('satellite');
      currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 0,
        maxZoom: 21,
      }).addTo(leafletMap);
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    } else if (leafletMap && mapType.toLowerCase() === 'openstreetmap') {
      map.style.display = 'block';
      threedmap.style.display = 'none';
      mapType = 'Satellite';
      map.classList.remove('dark');
      map.classList.add('satellite');
      currentTileLayer = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', {
        minZoom: 0,
        maxZoom: 21,
      }).addTo(leafletMap);
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    } else if (leafletMap && mapType.toLowerCase() === 'satellite') {
      map.style.display = 'none';
      threedmap.style.display = 'block';
      mapType = '3D';
      map.classList.remove('dark');
      map.classList.remove('satellite');
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(null);
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
        mount(Modal, {
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

    markers3D.forEach(marker => {
      let index = Array.from(markers3D.entries()).find(([index, value]) => value === marker)![0];
      if (markers3D.has(index)) {
        marker.remove();
      }
    });
    markers3D.clear();

    polylines.forEach(polyline => {
      if (leafletMap?.hasLayer(polyline)) {
        leafletMap.removeLayer(polyline);
      }
    });
    polylines.clear();
    markersStore.set(markers);
    polylinesStore.set(polylines);

    polylines3D.forEach(polyline => {
      threeDMap?.removeLayer(polyline);
      threeDMap?.removeSource(polyline);
    });
    polylines3D = [];
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
      threeDMap?.removeLayer(key);
      threeDMap?.removeSource(key);
      polylines3D = polylines3D.filter(polyline => polyline !== key);
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
      threeDMap.removeLayer(key);
      threeDMap.removeSource(key);
      polylines3D = polylines3D.filter(polyline => polyline !== key);
    }
  }

  function addPolyline(start: L.LatLng, end: L.LatLng) {
    const key = generatePolylineKey(start, end);
    removePolyline(start, end); // Ensure no old polyline is left

    const latlngs: L.LatLngExpression[] = [start, end];
    const polyline = L.polyline(latlngs, { color: 'red' });
    leafletMap?.addLayer(polyline);
    polylines.set(key, polyline);

    // 3D Map
    if (threeDMap) {
      const geojson = {
        'type': 'Feature',
        'properties': {},
        'geometry': {
          'type': 'LineString',
          'coordinates': [[start.lng, start.lat], [end.lng, end.lat]]
        }
      };
      threeDMap.addSource(key, {
        'type': 'geojson',
        'data': geojson
      });
      threeDMap.addLayer({
        'id': key,
        'type': 'line',
        'source': key,
        'layout': {
          'line-join': 'round',
          'line-cap': 'round'
        },
        'paint': {
          'line-color': '#BF93E4',
          'line-width': 5
        }
      });
      polylines3D.push(key);
    }
  }

  function generatePolylineKey(start: L.LatLng, end: L.LatLng): string {
    const startLatLng = [start.lat, start.lng].join(',');
    const endLatLng = [end.lat, end.lng].join(',');
    return [startLatLng, endLatLng].sort().join('-'); // Ensure consistent ordering
  }

  async function updateMap(index: number) {
    // Retrieve the action details using the index
    const action = actions[index];
    
    // Remove existing marker if it exists
    if (markers.has(index)) {
      leafletMap?.removeLayer(markers.get(index)!);
    }

    if (index !== 0) {
      // Add new marker with updated info if leafletMap and action are valid
      if (L && leafletMap && action) {
        const { type, lat, lon } = action;
        const iconIndex = action_types.indexOf(type);
        
        if (!isNaN(lat) && !isNaN(lon) && iconIndex >= 0) {
          const marker = L.marker([lat, lon], { icon: icons[iconIndex] })
            .bindPopup(`${index} - ${type}`);
          try { leafletMap.addLayer(marker); } catch (e) { return; }
          markers.set(index, marker);
        }
      }

      // 3D Map
      if (threeDMap && action) {
        const { type, lat, lon } = action;
        if (!isNaN(lat) && !isNaN(lon)) {
          let img = new Image();
          img.src = action_markers[action_types.indexOf(type)];
          img.onload = () => {
            let canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            let ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.translate(img.width / 2, img.height / 2);
              ctx.drawImage(img, -img.width / 2, -img.height / 2);
              ctx.save();
              canvas.style.width = '50px';
              canvas.style.height = '50px';
              const marker = new Marker({ element: canvas });
              marker.setLngLat([lon, lat]);
              if (markers3D.has(index)) {
                markers3D.get(index).remove();
              }
              markers3D.set(index, marker);
              marker.addTo(threeDMap);
            }
          }
        }
      }

      // Remove polylines connected to this action and update all polylines
      removeConnectedPolylines(index);
      updateMarkersAndPolylines();
    }
  }

  function updateMarkersAndPolylines(reindex: boolean = false) {
    if (reindex) {
      // Remove last marker
      const lastMarker = markers.get(Object.keys(actions).length + 1);
      if (lastMarker) {
        leafletMap?.removeLayer(lastMarker);
        markers3D.delete(Object.keys(actions).length + 1);
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
    polylines3D.forEach(polyline => {
      threeDMap?.removeLayer(polyline);
      threeDMap?.removeSource(polyline);
    });
    polylines3D = [];
    
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
    if (leafletMap && mavLocation) {
      let img = new Image();
      img.src = '/map/here.png'; // Use static path directly
      try { L.icon } catch (e) { return; }
      img.onload = () => {
        let canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        let ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.translate(img.width / 2, img.height / 2);
          ctx.rotate((mavHeading) * Math.PI / 180);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          ctx.save();
          let icon = L.icon({
            iconUrl: canvas.toDataURL(),
            iconSize: [45, 45],
            iconAnchor: [23, 20],
            popupAnchor: [0, -15],
            shadowSize: [41, 41]
          });
          if (mavMarker) {
            leafletMap.removeLayer(mavMarker);
          }
          mavMarker = L.marker(mavLocation as L.LatLng, { icon: icon })
            .bindPopup('MAV is here: ' + mavLocation.lat + ', ' + mavLocation.lng);
          leafletMap.addLayer(mavMarker);
          updateMarkersAndPolylines();
          if (lockView) {
            leafletMap.setView(mavLocation as L.LatLng, get(mapZoomStore));
          }
        }
      };
    }
  }
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');
  
  // Consolidate store subscriptions
  $effect(() => {
    darkMode = $darkModeStore;
    lockView = $lockViewStore;
    zoom = $mapZoomStore;
    leafletMap = $mapStore;
    threeDMap = $threeDMapStore;
    mapType = $mapTypeStore;
    currentTileLayer = $mapTileLayerStore;
  });

  // Handle MAV updates
  $effect(() => {
    const newMavHeading = $mavHeadingStore;
    const newMavLocation = $mavLocationStore;
    
    if (newMavHeading !== mavHeading || 
        (newMavLocation && 
         (newMavLocation.lat !== mavLocation?.lat || 
          newMavLocation.lng !== mavLocation?.lng))) {
      mavHeading = newMavHeading;
      mavLocation = newMavLocation;
      if (leafletMap && mavLocation) {
        updateMAVMarker();
      }
    }
  });

  // Handle mission plan updates
  $effect(() => {
    const newActions = $missionPlanActionsStore;
    if (newActions && JSON.stringify(newActions) !== JSON.stringify(actions)) {
      actions = newActions;
      if (leafletMap) {
        removeAllMarkers();
        updateMAVMarker();
        Object.keys(actions).forEach(index => updateMap(Number(index)));
      }
    }
  });

  // Handle marker updates
  $effect(() => {
    const newMarkers = $markersStore;
    if (newMarkers && newMarkers.size !== markers.size) {
      markers = newMarkers;
      if (leafletMap) {
        Object.keys(actions).forEach(index => {
          const markerIndex = Number(index);
          updateMap(markerIndex);
        });
      }
    }
  });

  // Handle polyline updates
  $effect(() => {
    const newPolylines = $polylinesStore;
    if (newPolylines && newPolylines.size !== polylines.size) {
      polylines = newPolylines;
      if (leafletMap) {
        Object.keys(actions).forEach(index => {
          const markerIndex = Number(index);
          if (markerIndex > 0) {
            updateMap(markerIndex);
          }
        });
      }
    }
  });
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
  <ThreeDMap />
  <button class="map-btn absolute top-[3.8rem] right-2 text-[#ffffff] bg-opacity-75 p-2 {lockView ? 'px-[15px]' : 'px-[13px]'} rounded-full" onclick={toggleLockView}> 
    <i class="fas {lockView ? 'fa-lock' : 'fa-lock-open'}"></i>
  </button>
  <button class="map-btn absolute top-3 right-2 text-[#ffffff] bg-opacity-75 p-2 px-[14px] rounded-full" onclick={handleFullScreen}>
    <i class="fas fa-expand"></i>
  </button>
  <label id="map-toggle" class="flex justify-center cursor-pointer my-2 absolute top-1 right-2 left-2 w-fit m-auto rounded-3xl p-2 pl-3 text-sm items-center" style={!hideOverlay ? 'display: flex;' : 'display: none;'}>
    <input type="checkbox" value="" class="sr-only peer" onclick={toggleMap}>
    <span class="text-white flex items-center gap-2">
      <i class="fas fa-map"></i>
      <span>{mapType}</span>
    </span>
    <div class="relative w-16 h-6 ml-3 bg-[#2b7c3f rounded-full transition-colors peer-focus:outline-none" class:bg-blue-500={mapType === 'OpenStreetMap'} class:bg-green-500={mapType === 'Satellite'} class:bg-purple-500={mapType === '3D'}>
      <div class="absolute top-[2px] left-[2px] bg-white rounded-full h-5 w-5 transition-all duration-300" style:transform={mapType === 'OpenStreetMap' ? 'translateX(0)' : mapType === 'Satellite' ? 'translateX(100%)' : 'translateX(200%)'}></div>
    </div>
  </label>
  <div id="location-display" class="text-black text-sm" style={!hideOverlay ? 'display: block;' : 'display: none;'}></div>
</div>
