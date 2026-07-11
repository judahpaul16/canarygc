<script lang="ts">
  import { onMount, untrack } from 'svelte';
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
  import { mavLocationStore, mavHeadingStore, mavAltitudeStore, mavModeStore } from '../stores/mavlinkStore';
  import { sendMavlinkCommand, setFlightMode, setPositionLocal } from '../lib/mavlink-client';
  import { isGuidedLabel } from '../lib/flight-modes';
  import DPad from './DPad.svelte';
  import LiveFeed from './LiveFeed.svelte';
  import {
    missionPlanActionsStore,
    type MissionPlanActions,
    missionIndexStore
  } from '../stores/missionPlanStore';
  import { get } from 'svelte/store';
  import { showModal } from '../lib/overlays';
  import {
    airspaceZonesStore,
    showAirspaceStore,
    ceilingCellsStore,
    showCeilingsStore,
    obstaclesStore,
    showObstaclesStore
  } from '../stores/safetyStore';
  import { airspaceColor, airspacePopupHtml } from '../lib/airspace';
  import { ceilingColor, ceilingPopupHtml, obstacleColor, obstaclePopupHtml } from '../lib/hazards';
  import { pointInPolygon } from '../lib/geo';
  import { refreshAirspace, refreshHazards } from '../lib/preflight';
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
  let leafletMap: L.Map | null = $derived($mapStore);
  let threeDMap: pkg.Map | null = $derived($threeDMapStore);
  let mapType: string = $derived($mapTypeStore);
  let currentTileLayer = $derived($mapTileLayerStore);
  let zoom = $derived($mapZoomStore);

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
  let markers3D: Map<number, pkg.Marker> = new Map();
  let polylines3D: string[] = [];
  let mavHeading: number = $state(0);
  let mavMarker: L.Marker;
  let darkMode = $derived($darkModeStore);

  const YAW_STEP_DEG = 10;
  const YAW_RATE_DEG_PER_S = 10;
  const YAW_RELATIVE_OFFSET = 1;
  const ALTITUDE_STEP_M = 10;

  let isFullscreen = $state(false);
  let feedDockOpen = $state(true);
  let controlDockOpen = $state(true);
  let lockPulse = $state(false);
  let lockPulseTimer: ReturnType<typeof setTimeout> | undefined;
  // A recenter closer than this is telemetry jitter, not a snap worth signaling.
  const LOCK_PULSE_MIN_PX = 30;

  function triggerLockPulse() {
    lockPulse = false;
    clearTimeout(lockPulseTimer);
    requestAnimationFrame(() => (lockPulse = true));
    lockPulseTimer = setTimeout(() => (lockPulse = false), 1200);
  }

  function isSmallScreen(): boolean {
    return window.matchMedia('(max-width: 990px)').matches;
  }

  // Small screens fit one open dock at a time.
  function openFeedDock() {
    feedDockOpen = true;
    if (isSmallScreen()) controlDockOpen = false;
  }

  function openControlDock() {
    controlDockOpen = true;
    if (isSmallScreen()) feedDockOpen = false;
  }

  function handleFullscreenChange() {
    isFullscreen = Boolean(document.fullscreenElement);
    if (!isFullscreen && window.location.href.includes('dashboard')) hideOverlay = true;
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      leafletMap?.invalidateSize();
    }, 300);
  }

  async function ensureGuided() {
    if (!isGuidedLabel(get(mavModeStore))) await setFlightMode('GUIDED');
  }

  async function nudgeAltitude(direction: 1 | -1) {
    await ensureGuided();
    await setPositionLocal(0, 0, -(get(mavAltitudeStore) + direction * ALTITUDE_STEP_M));
  }

  async function rotate(direction: 1 | -1) {
    await ensureGuided();
    await sendMavlinkCommand('CONDITION_YAW', [YAW_STEP_DEG, YAW_RATE_DEG_PER_S, direction, YAW_RELATIVE_OFFSET]);
  }






  onMount(async () => {
    try {
      // Load and initialize Leaflet
      L = (await import('leaflet')).default;
      if (id !== null) initializeLeafletMap(id);
      else initializeLeafletMap();
    } catch (error) {
      console.error('Script loading failed', error);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    if (window.matchMedia('(max-width: 990px)').matches) {
      feedDockOpen = false;
      controlDockOpen = false;
    }

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
          maxZoom: 20,
          attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        }).addTo(leafletMap);
      mapType = 'OpenStreetMap';
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    } else {
      currentTileLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          minZoom: 0,
          maxZoom: 20,
          subdomains:['mt0','mt1','mt2','mt3'],
          attribution: 'Map data &copy; <a href="https://www.google.com/maps">Google Maps</a>'
        }).addTo(leafletMap);
      mapType = 'Satellite';
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    }
    if (darkMode && mapType.toLowerCase() !== 'satellite') {
      document.getElementById('map')!.classList.add('dark');
    }

    if (hideOverlay) document.querySelectorAll('.map-btn i').forEach((element) => { (element as HTMLElement).style.fontSize = 'small'; });
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

    // A single click inspects (combined popup); a double-click adds a waypoint,
    // so the two intents never fight. Leaflet's double-click zoom is off here
    // because that gesture now places waypoints.
    leafletMap.doubleClickZoom.disable();
    leafletMap.on('click', (e: L.LeafletMouseEvent) => {
      openCombinedPopup(e.latlng);
    });
    leafletMap.on('dblclick', (e: L.LeafletMouseEvent) => {
      if (hideOverlay) return;
      const index = Object.keys(actions).length;
      actions[index] = { type: 'NAV_WAYPOINT', lat: e.latlng.lat, lon: e.latlng.lng, alt: null, notes: '', param1: null, param2: null, param3: null, param4: null };
      missionPlanActionsStore.set(actions);
      updateMap(index);
    });

    updateAttributionVisibility();

    mapStore.set(leafletMap);
    mavLocationStore.set(mavLocation);

    if (!hideOverlay) {
      refreshAirspace(get(missionPlanActionsStore));
      refreshHazards(get(missionPlanActionsStore));
      renderAirspace();
    }
  }

  const FEATURE_HIT_PX = 16;

  // Everything under a click, so overlapping airspace, ceilings, obstacles, and
  // mission markers collapse into one popup instead of fighting over the map.
  function popupSectionsAt(latlng: L.LatLng): string[] {
    if (!leafletMap) return [];
    const point = { lat: latlng.lat, lon: latlng.lng };
    const clickPx = leafletMap.latLngToContainerPoint(latlng);
    const withinHit = (lat: number, lon: number) => {
      const px = leafletMap!.latLngToContainerPoint([lat, lon] as L.LatLngExpression);
      return Math.hypot(px.x - clickPx.x, px.y - clickPx.y) <= FEATURE_HIT_PX;
    };

    const sections: string[] = [];
    if (get(showAirspaceStore)) {
      // Order by enforcement: hard no-fly first, then whichever controlled
      // airspace reaches lowest, so the layer that actually governs a drone at
      // this spot sits at the top and high-floor airspace (e.g. Class A) last.
      const zones = get(airspaceZonesStore)
        .filter((zone) => pointInPolygon(point, zone.polygon))
        .sort((a, b) => {
          if (a.restricted !== b.restricted) return a.restricted ? -1 : 1;
          return (a.lowerM ?? 0) - (b.lowerM ?? 0);
        });
      for (const zone of zones) sections.push(airspacePopupHtml(zone));
    }
    if (get(showCeilingsStore)) {
      for (const cell of get(ceilingCellsStore)) {
        if (pointInPolygon(point, cell.polygon)) sections.push(ceilingPopupHtml(cell));
      }
    }
    if (get(showObstaclesStore)) {
      for (const obstacle of get(obstaclesStore)) {
        if (withinHit(obstacle.lat, obstacle.lon)) sections.push(obstaclePopupHtml(obstacle));
      }
    }

    const missionHits: string[] = [];
    if (mavMarker) {
      const mav = mavMarker.getLatLng();
      if (withinHit(mav.lat, mav.lng)) missionHits.push('Aircraft position');
    }
    markers.forEach((marker, index) => {
      const ll = marker.getLatLng();
      if (withinHit(ll.lat, ll.lng)) missionHits.push(`Waypoint ${index}: ${actions[index]?.type ?? ''}`);
    });
    if (missionHits.length) sections.push(`<strong>Mission</strong><br>${missionHits.join('<br>')}`);

    return sections;
  }

  function openCombinedPopup(latlng: L.LatLng): boolean {
    if (!L || !leafletMap) return false;
    const sections = popupSectionsAt(latlng);
    if (!sections.length) return false;
    const html = `<div class="combined-popup">${sections.join('<hr class="popup-sep" />')}</div>`;
    L.popup({ maxHeight: 300, autoPan: true }).setLatLng(latlng).setContent(html).openOn(leafletMap);
    return true;
  }

  let airspaceLayer: L.LayerGroup | null = null;

  function renderAirspace() {
    if (!L || !leafletMap) return;
    airspaceLayer?.remove();
    if (!get(showAirspaceStore)) {
      airspaceLayer = null;
      return;
    }
    const group = L.layerGroup();
    for (const zone of get(airspaceZonesStore)) {
      for (const ring of zone.polygon) {
        const latlngs = ring.map(([lon, lat]) => [lat, lon] as [number, number]);
        L.polygon(latlngs, {
          color: airspaceColor(zone),
          weight: 1,
          fillOpacity: 0.12
        }).addTo(group);
      }
    }
    group.addTo(leafletMap);
    airspaceLayer = group;
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
        maxZoom: 20,
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
      }).addTo(leafletMap);
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    } else if (leafletMap && mapType.toLowerCase() === 'openstreetmap') {
      map.style.display = 'block';
      threedmap.style.display = 'none';
      mapType = 'Satellite';
      map.classList.remove('dark');
      map.classList.add('satellite');
      currentTileLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        minZoom: 0,
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: 'Map data &copy; <a href="https://www.google.com/maps">Google Maps</a>'
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
    updateAttributionVisibility();
  }

  function toggleLockView() {
    lockView = !lockView;
    lockViewStore.set(lockView);
  }

  function toggleAirspace() {
    showAirspaceStore.set(!get(showAirspaceStore));
    if (get(showAirspaceStore)) refreshAirspace(get(missionPlanActionsStore));
  }

  function toggleCeilings() {
    showCeilingsStore.set(!get(showCeilingsStore));
    if (get(showCeilingsStore)) refreshHazards(get(missionPlanActionsStore));
  }

  function toggleObstacles() {
    showObstaclesStore.set(!get(showObstaclesStore));
    if (get(showObstaclesStore)) refreshHazards(get(missionPlanActionsStore));
  }

  let ceilingLayer: L.LayerGroup | null = null;
  let obstacleLayer: L.LayerGroup | null = null;
  let obstacleRenderer: L.Renderer | null = null;

  // A pane above the polygon fills (overlayPane is 400) but below the mission
  // markers (markerPane is 600), so obstacle dots keep their true color instead
  // of being tinted by the translucent airspace and ceiling overlays.
  function obstaclePaneRenderer(): L.Renderer | null {
    if (!L || !leafletMap) return null;
    if (!leafletMap.getPane('obstacles')) {
      leafletMap.createPane('obstacles');
      const pane = leafletMap.getPane('obstacles');
      if (pane) pane.style.zIndex = '450';
    }
    obstacleRenderer ??= L.svg({ pane: 'obstacles' });
    return obstacleRenderer;
  }

  function renderCeilings() {
    if (!L || !leafletMap) return;
    ceilingLayer?.remove();
    if (!get(showCeilingsStore)) {
      ceilingLayer = null;
      return;
    }
    const group = L.layerGroup();
    for (const cell of get(ceilingCellsStore)) {
      for (const ring of cell.polygon) {
        const latlngs = ring.map(([lon, lat]) => [lat, lon] as [number, number]);
        L.polygon(latlngs, {
          color: ceilingColor(cell.ceilingFt),
          weight: 0.5,
          fillOpacity: 0.22
        }).addTo(group);
      }
    }
    group.addTo(leafletMap);
    ceilingLayer = group;
  }

  function renderObstacles() {
    if (!L || !leafletMap) return;
    obstacleLayer?.remove();
    if (!get(showObstaclesStore)) {
      obstacleLayer = null;
      return;
    }
    const renderer = obstaclePaneRenderer() ?? undefined;
    const group = L.layerGroup();
    for (const obstacle of get(obstaclesStore)) {
      L.circleMarker([obstacle.lat, obstacle.lon], {
        radius: 5,
        color: obstacleColor(obstacle.aglFt),
        weight: 2,
        fillOpacity: 0.9,
        renderer
      })
        .on('click', (ev) => openCombinedPopup((ev as L.LeafletMouseEvent).latlng))
        .addTo(group);
    }
    group.addTo(leafletMap);
    obstacleLayer = group;
  }

  function toggleFullScreen(element: HTMLElement) {
    if (window.location.href.includes('dashboard')) hideOverlay = !hideOverlay;
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        showModal({
          title: 'Error',
          content: `Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
          notification: true,
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
    updateAttributionVisibility();
  }

  function handleFullScreen() {
    const el = document.querySelector('.map-container');
    if (el instanceof HTMLElement) {
      toggleFullScreen(el);
    }
  }

  function updateAttributionVisibility() {
    const attribution = document.querySelector('.leaflet-control-attribution') as HTMLElement | null;
    if (attribution) attribution.style.display = hideOverlay ? 'none' : 'inline-flex';
  }

  function removeAllMarkers() {
    markers.forEach((marker) => {
      // not the first marker
      if (leafletMap?.hasLayer(marker) && marker.getLatLng() !== mavLocation) {
        leafletMap.removeLayer(marker);
      }
    });
    markers.clear();

    markers3D.forEach((marker) => {
      marker.remove();
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
      threeDMap?.removeLayer(key);
      threeDMap?.removeSource(key);
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
        'data': geojson as GeoJSON.Feature
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
          const numericIndex = Number(index);
          const marker = L.marker([lat, lon], { icon: icons[iconIndex], draggable: !hideOverlay })
            .on('click', (ev) => openCombinedPopup((ev as L.LeafletMouseEvent).latlng))
            .on('dragend', () => {
              const ll = marker.getLatLng();
              const current = get(missionPlanActionsStore);
              if (!current[numericIndex]) return;
              current[numericIndex] = { ...current[numericIndex], lat: ll.lat, lon: ll.lng };
              missionPlanActionsStore.set(current);
              updateMarkersAndPolylines();
            });
          try { leafletMap.addLayer(marker); } catch { return; }
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
              markers3D.get(index)?.remove();
              markers3D.set(index, marker);
              if (threeDMap) marker.addTo(threeDMap);
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
      const [, nextMarker] = markerEntries[i + 1];
      let [, prevMarker] = markerEntries[i];
      if (i > 0) [, prevMarker] = markerEntries[i - 1];
      
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
      if (!L) return;
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
            leafletMap?.removeLayer(mavMarker);
          }
          mavMarker = L.marker(mavLocation as L.LatLng, { icon: icon })
            .on('click', (ev) => openCombinedPopup((ev as L.LeafletMouseEvent).latlng));
          leafletMap?.addLayer(mavMarker);
          updateMarkersAndPolylines();
          if (lockView && leafletMap) {
            const centerPoint = leafletMap.latLngToContainerPoint(leafletMap.getCenter());
            const targetPoint = leafletMap.latLngToContainerPoint(mavLocation as L.LatLng);
            const snapDistance = Math.hypot(centerPoint.x - targetPoint.x, centerPoint.y - targetPoint.y);
            if (snapDistance > LOCK_PULSE_MIN_PX) triggerLockPulse();
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
  let lockView = $derived($lockViewStore);
  $effect.pre(() => {
    mavHeading = $mavHeadingStore;
    untrack(() => updateMAVMarker());
  });
  $effect.pre(() => {
    mavLocation = $mavLocationStore;
    untrack(() => updateMAVMarker());
  });
  $effect.pre(() => {
    actions = $missionPlanActionsStore;
    untrack(() => {
      removeAllMarkers();
      updateMAVMarker();
      Object.keys(actions).forEach((index) => {
        updateMap(Number(index));
      });
    });
  });
  $effect.pre(() => {
    markers = $markersStore;
    untrack(() => {
      Object.keys(actions).forEach((index) => {
        updateMap(Number(index));
      });
    });
  });
  $effect.pre(() => {
    polylines = $polylinesStore;
    untrack(() => {
      Object.keys(actions).forEach((index) => {
        updateMap(Number(index));
      });
    });
  });
  $effect.pre(() => {
    void $airspaceZonesStore;
    void $showAirspaceStore;
    if (!hideOverlay) untrack(() => renderAirspace());
  });
  $effect.pre(() => {
    void $ceilingCellsStore;
    void $showCeilingsStore;
    if (!hideOverlay) untrack(() => renderCeilings());
  });
  $effect.pre(() => {
    void $obstaclesStore;
    void $showObstaclesStore;
    if (!hideOverlay) untrack(() => renderObstacles());
  });
  // Overlay chrome follows hideOverlay wherever it changes, including an Esc
  // exit from fullscreen, so the dashboard mini-map reverts cleanly.
  $effect.pre(() => {
    const mini = hideOverlay;
    untrack(() => {
      updateAttributionVisibility();
      document.querySelectorAll('.map-btn i').forEach((element) => {
        (element as HTMLElement).style.fontSize = mini ? 'small' : '';
      });
    });
  });
</script>

<style lang="css">
  @import url('https://unpkg.com/leaflet@1.7.1/dist/leaflet.css');

  /* Leaflet renders popups outside this component, so the combined-popup
     separator between stacked features needs a global rule. */
  :global(.combined-popup .popup-sep) {
    border: none;
    border-top: 1px solid rgba(127, 127, 127, 0.35);
    margin: 0.5rem 0;
  }

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
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 2px solid var(--primaryColor);
    border-radius: 9999px;
    opacity: 0.95;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .map-btn:hover {
    opacity: 0.75;
    transform: scale(1.05);
  }

  /* The ring pairs white with a dark halo and the button flashes solid yellow
     with a dark icon, so the snap signal reads over the yellow overlays too. */
  .map-btn.lock-pulse {
    animation: lock-pulse 1.2s ease-out;
  }

  .map-btn.lock-pulse i {
    animation: lock-pulse-icon 1.2s ease-out;
  }

  @keyframes lock-pulse {
    0% {
      background-color: #f5c518;
      box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.95), 0 0 0 0 rgba(0, 0, 0, 0.5);
    }
    55% {
      background-color: #f5c518;
    }
    100% {
      background-color: var(--secondaryColor);
      box-shadow: 0 0 0 12px rgba(255, 255, 255, 0), 0 0 0 20px rgba(0, 0, 0, 0);
    }
  }

  @keyframes lock-pulse-icon {
    0%, 55% {
      color: #1c1c1e;
    }
  }
  #location-display {
    position: absolute;
    bottom: 10px;
    left: 10px;
    background: rgba(255,255,255,0.8);
    padding: 5px;
    border-radius: var(--radius-control);
    z-index: 1000;
  }

  .docks {
    position: absolute;
    left: 0.75rem;
    bottom: 3rem;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
    color: var(--fontColor);
  }

  .dock-panel {
    width: 320px;
    background-color: rgb(from var(--primaryColor) r g b / 0.88);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 0.9);
    border-radius: var(--radius-surface);
    overflow: hidden;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .dock-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.9rem;
    border-radius: 9999px;
    background-color: rgb(from var(--primaryColor) r g b / 0.88);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 0.9);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: var(--fontColor);
    font-size: 0.8rem;
    font-weight: 600;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }

  .dock-pill:hover {
    border-color: rgb(from var(--fontColor) r g b / 0.35);
    transform: translateY(-1px);
  }

  .dock-pill > i:first-child {
    color: #f5c518;
  }

  .dock-pill .chev {
    opacity: 0.55;
    font-size: 0.65rem;
  }

  .dock-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    border-bottom: 1px solid rgb(from var(--secondaryColor) r g b / 0.8);
  }

  .dock-head span i {
    color: #f5c518;
    margin-right: 0.45rem;
  }

  .dock-min {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-control);
    color: var(--fontColor);
    opacity: 0.7;
  }

  .dock-min:hover {
    opacity: 1;
    background-color: rgb(from var(--secondaryColor) r g b / 0.8);
  }

  .feed-body {
    width: 100%;
    aspect-ratio: 16 / 9;
    position: relative;
  }

  .control-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.6rem 0.9rem;
  }

  .control-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ctl-btn {
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background-color: rgb(from var(--secondaryColor) r g b / 0.9);
    color: var(--fontColor);
    transition: background-color 0.15s ease;
  }

  .ctl-btn:hover {
    background-color: var(--tertiaryColor);
  }

  @media (max-width: 990px) {
    .docks {
      bottom: 4.5rem;
      right: 0.75rem;
    }

    .dock-panel {
      width: min(300px, calc(100vw - 1.5rem));
    }

    .control-body {
      gap: 0.4rem;
      padding: 0.5rem 0.6rem;
    }
  }
</style>

<div class="map-container" style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};">
  <div id={id !== null ? id : 'map'} class="relative h-full rounded-2xl z-0"></div>
  <ThreeDMap />
  <div class="map-controls absolute top-3 right-2 z-[1] flex flex-col gap-2">
    <button class="map-btn" aria-label="Toggle fullscreen" title="Toggle fullscreen" onclick={handleFullScreen}>
      <i class="fas fa-expand"></i>
    </button>
    <button class="map-btn {lockPulse ? 'lock-pulse' : ''}" aria-label="Toggle map lock" title={lockView ? 'Unlock map (stop following the aircraft)' : 'Lock map to the aircraft'} onclick={toggleLockView}>
      <i class="fas {lockView ? 'fa-lock text-[#f5c518]' : 'fa-lock-open'}"></i>
    </button>
    {#if !hideOverlay}
      <button class="map-btn" aria-label="Toggle airspace overlay" title="Toggle airspace overlay" onclick={toggleAirspace}>
        <i class="fas fa-tower-broadcast {$showAirspaceStore ? 'text-[#f24e4e]' : ''}"></i>
      </button>
      <button class="map-btn" aria-label="Toggle LAANC ceiling grid" title="Toggle LAANC ceiling grid (max pre-approved altitude per square)" onclick={toggleCeilings}>
        <i class="fas fa-border-all {$showCeilingsStore ? 'text-[#22c55e]' : ''}"></i>
      </button>
      <button class="map-btn" aria-label="Toggle obstacles" title="Toggle obstacles (towers and tall structures from the FAA obstacle file)" onclick={toggleObstacles}>
        <i class="fas fa-tower-observation {$showObstaclesStore ? 'text-[#f97316]' : ''}"></i>
      </button>
    {/if}
  </div>
  <label id="map-toggle" class="flex justify-center cursor-pointer my-2 absolute top-1 right-2 left-2 w-fit m-auto rounded-3xl p-2 pl-3 text-sm items-center" style={!hideOverlay ? 'display: flex;' : 'display: none;'}>
    <input type="checkbox" value="" class="sr-only peer" onclick={toggleMap}>
    <span class="text-white flex items-center gap-2">
      <i class="fas fa-map"></i>
      <span>{mapType == '3D' ? '3D Buildings' : mapType}</span>
    </span>
    <div class="relative w-16 h-6 ml-3 bg-[#2b7c3f rounded-full transition-colors peer-focus:outline-none" class:bg-blue-500={mapType === 'OpenStreetMap'} class:bg-green-500={mapType === 'Satellite'} class:bg-purple-500={mapType === '3D'}>
      <div class="absolute top-[2px] left-[2px] bg-white rounded-full h-5 w-5 transition-all duration-300" style:transform={mapType === 'OpenStreetMap' ? 'translateX(0)' : mapType === 'Satellite' ? 'translateX(100%)' : 'translateX(200%)'}></div>
    </div>
  </label>
  <div id="location-display" class="text-black text-sm" style={!hideOverlay ? 'display: block;' : 'display: none;'}></div>

  {#if isFullscreen}
    <div class="docks">
      {#if feedDockOpen}
        <div class="dock-panel">
          <div class="dock-head">
            <span><i class="fas fa-video"></i>Live feed</span>
            <button class="dock-min" aria-label="Minimize live feed" title="Minimize" onclick={() => (feedDockOpen = false)}>
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
          <div class="feed-body"><LiveFeed compact /></div>
        </div>
      {:else}
        <button class="dock-pill" aria-label="Show live feed" onclick={openFeedDock}>
          <i class="fas fa-video"></i><span>Live feed</span><i class="fas fa-chevron-up chev"></i>
        </button>
      {/if}

      {#if controlDockOpen}
        <div class="dock-panel">
          <div class="dock-head">
            <span><i class="fas fa-gamepad"></i>Manual control</span>
            <button class="dock-min" aria-label="Minimize manual control" title="Minimize" onclick={() => (controlDockOpen = false)}>
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
          <div class="control-body">
            <div class="control-col">
              <button class="ctl-btn" aria-label="Altitude up" title="Altitude up {ALTITUDE_STEP_M} m" onclick={() => nudgeAltitude(1)}>
                <i class="fas fa-arrow-up"></i>
              </button>
              <button class="ctl-btn" aria-label="Altitude down" title="Altitude down {ALTITUDE_STEP_M} m" onclick={() => nudgeAltitude(-1)}>
                <i class="fas fa-arrow-down"></i>
              </button>
            </div>
            <DPad />
            <div class="control-col">
              <button class="ctl-btn" aria-label="Rotate left" title="Rotate left {YAW_STEP_DEG} degrees" onclick={() => rotate(-1)}>
                <i class="fas fa-rotate-left"></i>
              </button>
              <button class="ctl-btn" aria-label="Rotate right" title="Rotate right {YAW_STEP_DEG} degrees" onclick={() => rotate(1)}>
                <i class="fas fa-rotate-right"></i>
              </button>
            </div>
          </div>
        </div>
      {:else}
        <button class="dock-pill" aria-label="Show manual control" onclick={openControlDock}>
          <i class="fas fa-gamepad"></i><span>Manual control</span><i class="fas fa-chevron-up chev"></i>
        </button>
      {/if}
    </div>
  {/if}
</div>
