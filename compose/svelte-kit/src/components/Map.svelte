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
  import Stats from './Stats.svelte';
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
  import { resolveTiles, nativeMaxZoom, type TileSources } from '../lib/tiles';
  import { refreshAirspace, refreshHazards, fetchAirspaceForBbox, fetchHazardsForBbox } from '../lib/preflight';
  import ThreeDMap from './3DMap.svelte';
  import pkg from 'maplibre-gl';
  const { Marker } = pkg;

  import {
    darkModeStore,
  } from '../stores/customizationStore';
  import { mapWindowStore, mapShellStore, mapPanelStore, mapFullscreenStore, type MapRect } from '../stores/mapStore';
  import { loggedInStore } from '../stores/authStore';
  import { trafficStore, showTrafficStore, upsertTraffic, type TrafficContact } from '../stores/trafficStore';
  import 'leaflet/dist/leaflet.css';

  interface Props {
    id?: string | null;
  }

  let { id = 'map' }: Props = $props();

  let mavLocation: L.LatLng | { lat: number; lng: number } = $derived($mavLocationStore);
  let win = $derived($mapWindowStore);
  let isFullscreen = $state(false);
  let hideOverlay = $derived(isFullscreen ? false : win ? !win.overlay : true);

  // Window corner radius in px, matching --radius-surface.
  const SURFACE_R = 16;

  let shell = $derived($mapShellStore);
  let panel = $derived($mapPanelStore);

  // Splits a surface rect into strips around the window so the surface reads
  // as one card with the window punched out.
  function piecesAround(s: MapRect, w: MapRect | null, radius: string, edgeRadius: [string, string]): Array<MapRect & { radius: string }> {
    if (!w) return [{ ...s, radius }];
    return [
      { top: s.top, left: s.left, width: s.width, height: w.top - s.top, radius: edgeRadius[0] },
      { top: w.top + w.height, left: s.left, width: s.width, height: s.top + s.height - (w.top + w.height), radius: edgeRadius[1] },
      { top: w.top, left: s.left, width: w.left - s.left, height: w.height, radius: '0' },
      { top: w.top, left: w.left + w.width, width: s.left + s.width - (w.left + w.width), height: w.height, radius: '0' }
    ].filter((p) => p.width > 0 && p.height > 0);
  }

  // The nav rail and the dashboard slab read as one shell (right corners
  // rounded, left flat against the nav).
  let shellPieces = $derived.by(() => {
    if (!shell || isFullscreen) return [] as Array<MapRect & { radius: string }>;
    return piecesAround(shell, win, '0 var(--radius-shell) var(--radius-shell) 0', [
      '0 var(--radius-shell) 0 0',
      '0 0 var(--radius-shell) 0'
    ]);
  });

  let panelPieces = $derived.by(() => {
    if (!panel || isFullscreen) return [] as Array<MapRect & { radius: string }>;
    return piecesAround(panel, win, 'var(--radius-surface)', [
      'var(--radius-surface) var(--radius-surface) 0 0',
      '0 0 var(--radius-surface) var(--radius-surface)'
    ]);
  });

  // Concave corner covers: the window hole is square while the frame is
  // rounded, so each corner paints the surrounding surface outside the ring's
  // arc to stop raw map pixels peeking past the rounded corners.
  // The covers sit inside the window rect where no dim layer runs, so the slab
  // tone carries the dim composited in to match the surrounding pieces.
  let winCornerColor = $derived(panel ? 'var(--primaryColor)' : 'rgb(from var(--secondaryColor) calc(r * 0.91) calc(g * 0.91) calc(b * 0.91) / 0.93)');

  function cornerStyle(top: number, left: number, r: number, at: string, color: string): string {
    return `top:${top}px; left:${left}px; width:${r}px; height:${r}px; background: radial-gradient(circle at ${at}, transparent ${r - 1}px, ${color} ${r}px);`;
  }

  // Mission-planner chrome does not belong on other pages; leaving the map
  // page clears the overlay toggles and their rendered layers.
  $effect(() => {
    if (!hideOverlay) return;
    untrack(() => {
      if (get(showAirspaceStore)) {
        showAirspaceStore.set(false);
        renderAirspace();
      }
      if (get(showCeilingsStore)) {
        showCeilingsStore.set(false);
        renderCeilings();
      }
      if (get(showObstaclesStore)) {
        showObstaclesStore.set(false);
        renderObstacles();
      }
      if (get(showTrafficStore)) {
        showTrafficStore.set(false);
        renderTraffic();
      }
    });
  });

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

  let feedDockOpen = $state(true);
  let controlDockOpen = $state(true);
  let statsDockOpen = $state(true);
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
    if (isSmallScreen()) {
      controlDockOpen = false;
      statsDockOpen = false;
    }
  }

  function openControlDock() {
    controlDockOpen = true;
    if (isSmallScreen()) {
      feedDockOpen = false;
      statsDockOpen = false;
    }
  }

  function openStatsDock() {
    statsDockOpen = true;
    if (isSmallScreen()) {
      feedDockOpen = false;
      controlDockOpen = false;
    }
  }

  function handleFullscreenChange() {
    isFullscreen = Boolean(document.fullscreenElement);
    mapFullscreenStore.set(isFullscreen);
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
      await loadTileConfig();
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

  // Basemap sources resolve from the MapTiler key and any per-mode overrides set
  // in Integrations; the defaults use MapTiler's rich dark and hybrid styles.
  let tileSources = $state<TileSources>(resolveTiles());

  // Dark mode swaps to a genuine dark basemap rather than inverting the light
  // tiles, so the map reads cleanly and follows the theme toggle live.
  function osmTileUrl(): string {
    return darkMode ? tileSources.dark : tileSources.light;
  }

  // The map zooms past any source's native depth; Leaflet upscales beyond each
  // layer's maxNativeZoom so deep zooms stay usable instead of going blank.
  const MAP_MAX_ZOOM = 22;

  function tileLayerFor(url: string, satellite: boolean): L.TileLayer {
    const options: L.TileLayerOptions = {
      minZoom: 0,
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: nativeMaxZoom(url),
      attribution: satellite ? tileSources.satelliteAttribution : tileSources.osmAttribution
    };
    if (satellite) options.subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    return L.tileLayer(url, options);
  }

  // setView centers the viewport; panBy shifts that point to the window center.
  function centerInWindow(latlng: L.LatLngExpression, zoom?: number) {
    if (!leafletMap) return;
    leafletMap.setView(latlng, zoom ?? leafletMap.getZoom(), { animate: false });
    const w = isFullscreen ? null : get(mapWindowStore);
    if (!w) return;
    const size = leafletMap.getSize();
    leafletMap.panBy(
      [size.x / 2 - (w.left + w.width / 2), size.y / 2 - (w.top + w.height / 2)],
      { animate: false }
    );
  }

  async function loadTileConfig() {
    try {
      const res = await fetch('/api/map-config');
      if (res.ok) tileSources = await res.json();
    } catch {
      // Keep the built-in defaults.
    }
  }

  function initializeLeafletMap(id: string = 'map') {
    let threedmap = document.getElementById('threedmap')!;
    if (threedmap) threedmap.style.display = 'none';
    leafletMap = L.map(id);
    centerInWindow(mavLocation, zoom);
    if (mapType.toLowerCase() === 'openstreetmap') {
      currentTileLayer = tileLayerFor(osmTileUrl(), false).addTo(leafletMap);
      mapType = 'OpenStreetMap';
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    } else {
      currentTileLayer = tileLayerFor(tileSources.satellite, true).addTo(leafletMap);
      mapType = 'Satellite';
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    }
    updateMAVMarker();

    const locationDisplay = document.querySelector('#location-display')!;

    // Update location display when MAV position changes
    function updateLocationDisplay(loc: L.LatLng | { lat: number; lng: number }) {
        locationDisplay.textContent = `MAV Location: ${loc.lat.toFixed(6)}°, ${loc.lng.toFixed(6)}°, Yaw Angle: ${mavHeading}°, Altitude: ${get(mavAltitudeStore)}m`;
    }
    updateLocationDisplay(mavLocation);

    // Subscribe to MAV location changes
    mavLocationStore.subscribe(location => {
        updateLocationDisplay(location);
    });

    // A single click inspects (combined popup); a double-click adds a waypoint,
    // so the two intents never fight. Leaflet's double-click zoom is off here
    // because that gesture now places waypoints.
    leafletMap.doubleClickZoom.disable();
    // A single click on the map opens the info modal, but only after a short
    // delay so a double-click (which places a waypoint) can cancel it first.
    leafletMap.on('click', (e: L.LeafletMouseEvent) => {
      if (mapClickTimer) clearTimeout(mapClickTimer);
      mapClickTimer = setTimeout(() => {
        mapClickTimer = null;
        openCombinedPopup(e.latlng);
      }, MAP_CLICK_DELAY_MS);
    });
    leafletMap.on('dblclick', (e: L.LeafletMouseEvent) => {
      if (mapClickTimer) {
        clearTimeout(mapClickTimer);
        mapClickTimer = null;
      }
      if (hideOverlay) return;
      addWaypoint(e.latlng);
    });
    leafletMap.on('moveend', () => {
      if (viewportTimer) clearTimeout(viewportTimer);
      viewportTimer = setTimeout(refreshViewportOverlays, VIEWPORT_REFRESH_DELAY_MS);
    });

    mapStore.set(leafletMap);

    if (!hideOverlay) {
      refreshAirspace(get(missionPlanActionsStore));
      refreshHazards(get(missionPlanActionsStore));
      renderAirspace();
    }
  }

  // Long enough to tell a single click (open the info modal) from a double
  // click (place a waypoint).
  const MAP_CLICK_DELAY_MS = 250;
  let mapClickTimer: ReturnType<typeof setTimeout> | null = null;

  // A modest climb so the takeoff actually leaves the ground; 0 would read as
  // "current altitude" and never climb.
  const DEFAULT_TAKEOFF_ALT_M = 10;

  // Adding a waypoint seeds a takeoff at the aircraft's location first when the
  // mission has none, since nearly every ArduPilot and PX4 mission must begin
  // with a takeoff. The waypoint lands at the double-clicked point.
  function addWaypoint(latlng: L.LatLng) {
    const current = get(missionPlanActionsStore);
    const ordered = Object.keys(current)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => current[i]);
    const blank = { notes: '', param1: null, param2: null, param3: null, param4: null };

    const mav = get(mavLocationStore);
    const lat = mav && 'lat' in mav && mav.lat !== 0 ? mav.lat : latlng.lat;
    const lon = mav && 'lng' in mav && mav.lng !== 0 ? mav.lng : latlng.lng;
    const takeoff = () => ({ type: 'NAV_TAKEOFF', lat, lon, alt: DEFAULT_TAKEOFF_ALT_M, ...blank });

    // Index 0 is the hidden home slot (the panel and the markers skip it), so
    // the plan needs one, and the takeoff check only counts the visible rows.
    if (ordered.length === 0) ordered.push(takeoff());
    const hasTakeoff = ordered
      .slice(1)
      .some((a) => a.type === 'NAV_TAKEOFF' || a.type === 'NAV_VTOL_TAKEOFF');
    if (!hasTakeoff) ordered.splice(1, 0, takeoff());
    ordered.push({ type: 'NAV_WAYPOINT', lat: latlng.lat, lon: latlng.lng, alt: null, ...blank });

    const next: MissionPlanActions = {};
    ordered.forEach((item, i) => {
      next[i] = item;
    });
    missionPlanActionsStore.set(next);
  }

  // Refetch overlays for the visible area as the operator pans; debounced, and
  // skipped when zoomed too far out for the overlays to be useful.
  const VIEWPORT_REFRESH_DELAY_MS = 500;
  const MIN_OVERLAY_ZOOM = 9;
  let viewportTimer: ReturnType<typeof setTimeout> | null = null;

  function refreshViewportOverlays() {
    if (!leafletMap || hideOverlay || leafletMap.getZoom() < MIN_OVERLAY_ZOOM) return;
    const b = leafletMap.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    if (get(showAirspaceStore)) fetchAirspaceForBbox(bbox);
    if (get(showCeilingsStore) || get(showObstaclesStore)) fetchHazardsForBbox(bbox);
  }

  const FEATURE_HIT_PX = 16;

  // Everything under a click, so overlapping airspace, ceilings, obstacles, and
  // mission markers collapse into one popup instead of fighting over the map.
  // Each section carries the accent color of its map layer so the modal cards
  // match the overlays.
  function popupSectionsAt(latlng: L.LatLng): { html: string; accent: string }[] {
    if (!leafletMap) return [];
    const point = { lat: latlng.lat, lon: latlng.lng };
    const clickPx = leafletMap.latLngToContainerPoint(latlng);
    const withinHit = (lat: number, lon: number) => {
      const px = leafletMap!.latLngToContainerPoint([lat, lon] as L.LatLngExpression);
      return Math.hypot(px.x - clickPx.x, px.y - clickPx.y) <= FEATURE_HIT_PX;
    };

    const sections: { html: string; accent: string }[] = [];
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
      for (const zone of zones) sections.push({ html: airspacePopupHtml(zone), accent: airspaceColor(zone) });
    }
    if (get(showCeilingsStore)) {
      for (const cell of get(ceilingCellsStore)) {
        if (pointInPolygon(point, cell.polygon)) sections.push({ html: ceilingPopupHtml(cell), accent: ceilingColor(cell.ceilingFt) });
      }
    }
    if (get(showObstaclesStore)) {
      for (const obstacle of get(obstaclesStore)) {
        if (withinHit(obstacle.lat, obstacle.lon)) sections.push({ html: obstaclePopupHtml(obstacle), accent: obstacleColor(obstacle.aglFt) });
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
    if (missionHits.length) sections.push({ html: `<strong>Mission</strong><br>${missionHits.join('<br>')}`, accent: '#61cd89' });

    return sections;
  }

  function openCombinedPopup(latlng: L.LatLng): boolean {
    const sections = popupSectionsAt(latlng);
    if (!sections.length) return false;
    const lat = latlng.lat.toFixed(6);
    const lon = latlng.lng.toFixed(6);
    const coords = `${lat}, ${lon}`;
    const content =
      `<div class="airspace-modal">${sections.map((s) => `<div class="am-section" style="border-left-color:${s.accent}">${s.html}</div>`).join('')}` +
      `<div class="am-coords"><span><i class="fas fa-location-dot"></i> ${coords}</span>` +
      `<button type="button" class="am-copy" onclick="navigator.clipboard&&navigator.clipboard.writeText('${coords}')"><i class="fas fa-copy"></i> Copy</button></div>` +
      `<div class="am-actions">` +
      `<a class="am-action" href="https://www.aloft.ai/feature/laanc/" target="_blank" rel="noopener"><i class="fas fa-tower-broadcast"></i> Request LAANC</a>` +
      `<a class="am-action" href="https://www.faa.gov/uas/recreational_fliers/where_can_i_fly/b4ufly/" target="_blank" rel="noopener"><i class="fas fa-plane-up"></i> FAA B4UFLY</a>` +
      `<a class="am-action" href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Open in Maps</a>` +
      `</div></div>`;
    showModal({ title: 'Airspace & hazards', content, html: true, notification: true });
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
    const renderer = paneRenderer('airspace', '405');
    const group = L.layerGroup();
    for (const zone of get(airspaceZonesStore)) {
      for (const ring of zone.polygon) {
        const latlngs = ring.map(([lon, lat]) => [lat, lon] as [number, number]);
        L.polygon(latlngs, {
          color: airspaceColor(zone),
          weight: 1,
          fillOpacity: 0.12,
          ...(renderer ? { renderer } : {})
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
      map.classList.remove('satellite');
      currentTileLayer = tileLayerFor(osmTileUrl(), false).addTo(leafletMap);
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(currentTileLayer);
    } else if (leafletMap && mapType.toLowerCase() === 'openstreetmap') {
      map.style.display = 'block';
      threedmap.style.display = 'none';
      mapType = 'Satellite';
      map.classList.add('satellite');
      currentTileLayer = tileLayerFor(tileSources.satellite, true).addTo(leafletMap);
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
  let trafficLayer: L.LayerGroup | null = null;
  const TRAFFIC_POLL_MS = 5000;
  const M_PER_FT = 0.3048;

  async function refreshTraffic() {
    if (!leafletMap || hideOverlay || !get(showTrafficStore)) return;
    const b = leafletMap.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    try {
      const res = await fetch(`/api/traffic?bbox=${bbox}`);
      if (!res.ok) return;
      const data = await res.json();
      const now = Date.now();
      upsertTraffic(
        (data.contacts ?? []).map((c: Omit<TrafficContact, 'source' | 'seenAt'>) => ({
          ...c,
          source: 'network' as const,
          seenAt: now
        }))
      );
    } catch {
      // Feed hiccup; the next poll retries.
    }
  }

  function trafficPopupHtml(c: TrafficContact): string {
    const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const alt = c.altM === null ? 'unknown' : `${Math.round(c.altM)} m (${Math.round(c.altM / M_PER_FT)} ft)`;
    const speed = c.speedMps === null ? 'unknown' : `${Math.round(c.speedMps)} m/s`;
    const heading = c.headingDeg === null ? 'unknown' : `${Math.round(c.headingDeg)}°`;
    const source = c.source === 'vehicle' ? 'onboard ADS-B receiver' : 'network feed';
    return `<b>${esc(c.callsign)}</b><br>Altitude: ${alt}<br>Speed: ${speed}<br>Track: ${heading}<br>Source: ${source}`;
  }

  function renderTraffic() {
    if (!L || !leafletMap) return;
    trafficLayer?.remove();
    trafficLayer = null;
    if (!get(showTrafficStore)) return;
    const group = L.layerGroup();
    for (const c of Object.values(get(trafficStore))) {
      const icon = L.divIcon({
        className: 'traffic-icon',
        html: `<i class="fas fa-plane" style="transform: rotate(${(c.headingDeg ?? 0) - 90}deg)"></i>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      L.marker([c.lat, c.lon], { icon }).bindPopup(trafficPopupHtml(c)).addTo(group);
    }
    group.addTo(leafletMap);
    trafficLayer = group;
  }

  function toggleTraffic() {
    const next = !get(showTrafficStore);
    showTrafficStore.set(next);
    renderTraffic();
    if (next) refreshTraffic();
  }

  // A pane above the polygon fills (overlayPane is 400) but below the mission
  // markers (markerPane is 600), so obstacle dots keep their true color instead
  // of being tinted by the translucent airspace and ceiling overlays.
  // Vector paths render into their renderer's pane, so each overlay gets a
  // dedicated pane and SVG renderer with a fixed z-order: ceilings (402) under
  // airspace (405) under obstacles (450) under mission paths (590) under the
  // markers (Leaflet's markerPane, 600). Sharing one pane makes stacking follow
  // insertion order, which flickers as layers re-render at different cadences.
  const paneRenderers = new Map<string, L.Renderer>();
  function paneRenderer(name: string, zIndex: string): L.Renderer | null {
    if (!L || !leafletMap) return null;
    if (!leafletMap.getPane(name)) {
      leafletMap.createPane(name);
      const pane = leafletMap.getPane(name);
      if (pane) pane.style.zIndex = zIndex;
    }
    if (!paneRenderers.has(name)) paneRenderers.set(name, L.svg({ pane: name }));
    return paneRenderers.get(name) ?? null;
  }

  function obstaclePaneRenderer(): L.Renderer | null {
    return paneRenderer('obstacles', '450');
  }

  function renderCeilings() {
    if (!L || !leafletMap) return;
    ceilingLayer?.remove();
    if (!get(showCeilingsStore)) {
      ceilingLayer = null;
      return;
    }
    const renderer = paneRenderer('ceilings', '402');
    const group = L.layerGroup();
    for (const cell of get(ceilingCellsStore)) {
      for (const ring of cell.polygon) {
        const latlngs = ring.map(([lon, lat]) => [lat, lon] as [number, number]);
        L.polygon(latlngs, {
          color: ceilingColor(cell.ceilingFt),
          weight: 0.5,
          fillOpacity: 0.22,
          ...(renderer ? { renderer } : {})
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
    const renderer = paneRenderer('mission', '590');
    const polyline = L.polyline(latlngs, { color: 'red', ...(renderer ? { renderer } : {}) });
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
            const w = isFullscreen ? null : get(mapWindowStore);
            const size = leafletMap.getSize();
            const windowCenter = w
              ? { x: w.left + w.width / 2, y: w.top + w.height / 2 }
              : { x: size.x / 2, y: size.y / 2 };
            const targetPoint = leafletMap.latLngToContainerPoint(mavLocation as L.LatLng);
            const snapDistance = Math.hypot(windowCenter.x - targetPoint.x, windowCenter.y - targetPoint.y);
            if (snapDistance > LOCK_PULSE_MIN_PX) triggerLockPulse();
            centerInWindow(mavLocation as L.LatLng, get(mapZoomStore));
          }
        }
      };
    }
  }
  let lockView = $derived($lockViewStore);
  $effect(() => {
    const dark = $darkModeStore;
    const sources = tileSources;
    untrack(() => {
      const layer = get(mapTileLayerStore) as L.TileLayer | null;
      if (!layer) return;
      const url =
        get(mapTypeStore) === 'Satellite' ? sources.satellite : dark ? sources.dark : sources.light;
      layer.options.maxNativeZoom = nativeMaxZoom(url);
      layer.setUrl(url);
    });
  });

  // The tile config is behind auth; refetch once the operator logs in.
  $effect(() => {
    if ($loggedInStore) untrack(() => void loadTileConfig());
  });

  $effect.pre(() => {
    mavHeading = $mavHeadingStore;
    untrack(() => updateMAVMarker());
  });
  $effect.pre(() => {
    void $mavLocationStore;
    untrack(() => updateMAVMarker());
  });
  $effect(() => {
    void win;
    void isFullscreen;
    untrack(() => {
      if (!leafletMap) return;
      leafletMap.invalidateSize();
      centerInWindow(get(mavLocationStore) as L.LatLng, get(mapZoomStore));
    });
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
  $effect.pre(() => {
    void $trafficStore;
    void $showTrafficStore;
    if (!hideOverlay) untrack(() => renderTraffic());
  });
  // Live traffic goes stale in seconds, so poll while the overlay is on.
  $effect(() => {
    if (!$showTrafficStore || hideOverlay) return;
    const timer = setInterval(refreshTraffic, TRAFFIC_POLL_MS);
    return () => clearInterval(timer);
  });
</script>

<style lang="css">
  .map-container {
    position: fixed;
    inset: 0;
    height: 100vh;
    width: 100vw;
    z-index: 0;
    pointer-events: auto;
  }

  #map {
    height: 100%;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
    display: block;
  }

  .dim {
    position: absolute;
    z-index: 2;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: auto;
  }

  .shell-piece {
    position: absolute;
    z-index: 3;
    background-color: rgb(from var(--secondaryColor) r g b / 0.85);
    pointer-events: auto;
  }

  .panel-piece {
    position: absolute;
    z-index: 4;
    background-color: var(--primaryColor);
    pointer-events: auto;
  }

  .corner {
    position: absolute;
    z-index: 2;
    pointer-events: auto;
  }

  .corner-win {
    z-index: 5;
  }

  .dim-full {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 1;
    pointer-events: auto;
  }

  .window-frame {
    position: absolute;
    top: var(--wt);
    left: var(--wl);
    width: var(--ww);
    height: var(--wh);
    z-index: 6;
    pointer-events: none;
    border: 8px solid var(--primaryColor);
    border-radius: var(--radius-surface);
  }

  .window-frame > * {
    pointer-events: auto;
  }

  .map-container.fs .window-frame {
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
  }

  .map-container.mini .window-frame {
    border-width: 4px;
    border-color: var(--secondaryColor);
  }

  .map-container.mini .map-btn {
    width: 1.75rem;
    height: 1.75rem;
  }

  .map-container.mini .map-btn i {
    font-size: small;
  }

  .map-container :global(.leaflet-control-container),
  .map-container :global(.maplibregl-control-container) {
    position: absolute;
    top: var(--wt);
    left: var(--wl);
    width: var(--ww);
    height: var(--wh);
    pointer-events: none;
  }

  .map-container.fs :global(.leaflet-control-container),
  .map-container.fs :global(.maplibregl-control-container) {
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .map-container.passive :global(.leaflet-control-container),
  .map-container.passive :global(.maplibregl-control-container) {
    display: none;
  }

  .map-container.mini :global(.leaflet-control-attribution),
  .map-container.passive :global(.leaflet-control-attribution) {
    display: none;
  }

  .map-container :global(.traffic-icon i) {
    color: #38bdf8;
    font-size: 16px;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
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

  /* The embedded Stats keeps its own rows and button logic; the dock panel
     supplies the surface, so its card chrome and full height come off. */
  .stats-body {
    max-height: 46vh;
    overflow-y: auto;
  }

  .stats-body :global(.stats) {
    height: auto;
    background-color: transparent;
    box-shadow: none;
    border-radius: 0;
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

<div
  class="map-container"
  class:fs={isFullscreen}
  class:passive={!win && !isFullscreen}
  class:mini={!isFullscreen && win !== null && !win.overlay}
  style="--wt: {win?.top ?? 0}px; --wl: {win?.left ?? 0}px; --ww: {win?.width ?? 0}px; --wh: {win?.height ?? 0}px;"
>
  <div id={id !== null ? id : 'map'} class="relative h-full z-0"></div>
  <ThreeDMap />
  {#if !isFullscreen && win}
    <div class="dim" style="top:0; left:0; right:0; height:{win.top}px;"></div>
    <div class="dim" style="top:{win.top + win.height}px; left:0; right:0; bottom:0;"></div>
    <div class="dim" style="top:{win.top}px; left:0; width:{win.left}px; height:{win.height}px;"></div>
    <div class="dim" style="top:{win.top}px; left:{win.left + win.width}px; right:0; height:{win.height}px;"></div>
  {/if}
  {#each shellPieces as p, i (i)}
    <div
      class="shell-piece"
      style="top:{p.top}px; left:{p.left}px; width:{p.width}px; height:{p.height}px; border-radius:{p.radius};"
    ></div>
  {/each}
  {#each panelPieces as p, i (i)}
    <div
      class="panel-piece"
      style="top:{p.top}px; left:{p.left}px; width:{p.width}px; height:{p.height}px; border-radius:{p.radius};"
    ></div>
  {/each}
  {#if !isFullscreen && win}
    <div class="corner corner-win" style={cornerStyle(win.top, win.left, SURFACE_R, '100% 100%', winCornerColor)}></div>
    <div class="corner corner-win" style={cornerStyle(win.top, win.left + win.width - SURFACE_R, SURFACE_R, '0% 100%', winCornerColor)}></div>
    <div class="corner corner-win" style={cornerStyle(win.top + win.height - SURFACE_R, win.left, SURFACE_R, '100% 0%', winCornerColor)}></div>
    <div class="corner corner-win" style={cornerStyle(win.top + win.height - SURFACE_R, win.left + win.width - SURFACE_R, SURFACE_R, '0% 0%', winCornerColor)}></div>
  {/if}
  {#if isFullscreen || win}
    <div class="window-frame">
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
      <button class="map-btn" aria-label="Toggle live air traffic" title="Toggle live air traffic (ADS-B from the vehicle receiver and network feeds)" onclick={toggleTraffic}>
        <i class="fas fa-plane {$showTrafficStore ? 'text-[#38bdf8]' : ''}"></i>
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
      {#if statsDockOpen}
        <div class="dock-panel">
          <div class="dock-head">
            <span><i class="fas fa-gauge-high"></i>Stats</span>
            <button class="dock-min" aria-label="Minimize stats" title="Minimize" onclick={() => (statsDockOpen = false)}>
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
          <div class="stats-body"><Stats /></div>
        </div>
      {:else}
        <button class="dock-pill" aria-label="Show stats" onclick={openStatsDock}>
          <i class="fas fa-gauge-high"></i><span>Stats</span><i class="fas fa-chevron-up chev"></i>
        </button>
      {/if}

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
  {:else}
    <div class="dim-full"></div>
  {/if}
</div>
