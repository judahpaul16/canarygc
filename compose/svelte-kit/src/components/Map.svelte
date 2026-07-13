<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import {
    mapStore,
    markersStore,
    polylinesStore,
    mapTypeStore,
    mapTileLayerStore,
    mapZoomStore,
    lockViewStore,
    threeDMapStore,
    missionPathsStore
  } from '../stores/mapStore';
  import { mavLocationStore, mavHeadingStore, mavAltitudeStore, mavModeStore, mavTypeStore } from '../stores/mavlinkStore';
  import { sendMavlinkCommand, setFlightMode, setPositionLocal, repositionRelative } from '../lib/mavlink-client';
  import { isGuidedLabel, isAirVehicle, isPX4 } from '../lib/flight-modes';
  import { missionSegmentPaths, stopsAt, type PathNode, type PathPoint } from '../lib/spline-path';
  import { hasSessionValue } from '../lib/session-persisted';
  import { surveyGrid, orbit, type PatternPoint } from '../lib/mission-patterns';
  import { patternCaptureStore } from '../stores/patternStore';
  import { gamepadActiveStore, toggleGamepad } from '../lib/gamepad-session';
  import DPad from './DPad.svelte';
  import LiveFeed from './LiveFeed.svelte';
  import Stats from './Stats.svelte';
  import {
    missionPlanActionsStore,
    type MissionPlanActions,
    missionIndexStore
  } from '../stores/missionPlanStore';
  import { get } from 'svelte/store';
  import { showModal, notify } from '../lib/overlays';
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
  import type pkg from 'maplibre-gl';
  import { ACTION_TYPES, ACTION_MARKERS } from '../lib/mission-icons';

  import {
    darkModeStore,
    mavIconStore,
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

  // Airspace, LAANC ceilings, obstacles, and live traffic only matter to
  // something that flies, so they enable themselves once when an air vehicle
  // type comes over the link and stay off for rovers, boats, and submarines.
  // Toggles the operator already set this session win over the default.
  let overlayDefaultsApplied = false;
  $effect(() => {
    const type = $mavTypeStore;
    const hidden = hideOverlay;
    untrack(() => {
      if (overlayDefaultsApplied || !type || hidden) return;
      overlayDefaultsApplied = true;
      if (!isAirVehicle(type)) return;
      if (!hasSessionValue('map.showAirspace')) showAirspaceStore.set(true);
      if (!hasSessionValue('map.showCeilings')) showCeilingsStore.set(true);
      if (!hasSessionValue('map.showObstacles')) showObstaclesStore.set(true);
      if (!hasSessionValue('map.showTraffic')) showTrafficStore.set(true);
    });
  });

  // Whenever an overlay is on with the planner visible (toggled on, restored
  // from the session, or auto-enabled), fetch its data; the endpoints sit
  // behind TTL caches so repeats are cheap.
  $effect(() => {
    const wantAirspace = $showAirspaceStore;
    const wantCeilings = $showCeilingsStore;
    const wantObstacles = $showObstaclesStore;
    const wantTraffic = $showTrafficStore;
    if (hideOverlay) return;
    untrack(() => {
      if (wantAirspace) refreshAirspace(get(missionPlanActionsStore));
      if (wantCeilings || wantObstacles) refreshHazards(get(missionPlanActionsStore));
      if (wantTraffic) refreshTraffic();
    });
  });

  let L: typeof import('leaflet');
  let leafletMap: L.Map | null = $derived($mapStore);
  let threeDMap: pkg.Map | null = $derived($threeDMapStore);
  let mapType: string = $derived($mapTypeStore);
  let currentTileLayer = $derived($mapTileLayerStore);
  let zoom = $derived($mapZoomStore);

  let actions: MissionPlanActions = $state({});
  let icons: L.Icon[] = [];
  let markers: Map<number, L.Marker> = $state(get(markersStore)); // Map to keep track of markers
  let polylines: Map<string, L.Polyline> = $state(get(polylinesStore)); // Map to keep track of polylines
  let mavHeading: number = $state(0);
  let mavMarker: L.Marker;
  let darkMode = $derived($darkModeStore);

  const YAW_STEP_DEG = 10;
  const YAW_RATE_DEG_PER_S = 10;
  const YAW_RELATIVE_OFFSET = 1;
  // One meter per click: a vertical step is the ground-impact axis, so each
  // press stays small and predictable; big altitude changes belong to the
  // plan or a guided target. Horizontal D-pad nudges stay at 10 m.
  const ALTITUDE_STEP_M = 1;

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

  // Escape cancels an in-progress pattern capture; leaving the planner does
  // the same, since capture clicks only exist on the interactive window.
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelPatternCapture();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  $effect(() => {
    if (hideOverlay) untrack(() => cancelPatternCapture());
  });

  let gamepadActive = $derived($gamepadActiveStore);

  async function ensureGuided() {
    if (!isGuidedLabel(get(mavModeStore))) await setFlightMode('GUIDED');
  }

  // PX4 rides DO_REPOSITION for altitude and yaw (CONDITION_YAW and single
  // local setpoints come back UNSUPPORTED there); ArduPilot keeps its GUIDED
  // mechanisms.
  async function nudgeAltitude(direction: 1 | -1) {
    if (isPX4()) {
      await repositionRelative(0, 0, direction * ALTITUDE_STEP_M);
      return;
    }
    await ensureGuided();
    await setPositionLocal(0, 0, -(get(mavAltitudeStore) + direction * ALTITUDE_STEP_M));
  }

  async function rotate(direction: 1 | -1) {
    if (isPX4()) {
      const yaw = (get(mavHeadingStore) + direction * YAW_STEP_DEG + 360) % 360;
      await repositionRelative(0, 0, 0, yaw);
      return;
    }
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

    icons = ACTION_MARKERS.map((marker) => {
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

    observeContainerResize();
  });

  // Leaflet does not track its container size the way MapLibre does, so the
  // full-viewport map keeps a stale tile grid, and paints gray where the
  // viewport grew, until invalidateSize runs. The rect-driven effect only
  // fires when the framed window changes size, which a fixed-size mini-map
  // never does on a viewport resize, so a ResizeObserver on the container is
  // what actually catches browser resizes, zoom, orientation, and panel
  // changes. It coalesces bursts to one paint per frame and skips while the
  // container is hidden (a background page, or the 3D view active).
  let containerObserver: ResizeObserver | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  function repaintForSize() {
    if (!leafletMap) return;
    const container = document.querySelector('.map-container') as HTMLElement | null;
    if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) return;
    leafletMap.invalidateSize({ pan: false, debounceMoveend: true });
    get(threeDMapStore)?.resize();
    centerInWindow(get(mavLocationStore) as L.LatLng, get(mapZoomStore));
    // Leaflet reads the size synchronously, but flex/grid can settle a frame
    // later; a trailing pass fills any tiles the first invalidate missed.
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => leafletMap?.invalidateSize({ pan: false }), 200);
  }
  // The container is fixed full-viewport and always visible (unlike #map, which
  // is display:none in the 3D view), so observing it catches every viewport
  // resize, browser zoom, and panel change. A window resize listener backs it
  // up. Leaflet does not track its own container size the way MapLibre does.
  let onWindowResize: (() => void) | null = null;
  function observeContainerResize() {
    const container = document.querySelector('.map-container');
    if (!container || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    onWindowResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(repaintForSize);
    };
    containerObserver = new ResizeObserver(onWindowResize);
    containerObserver.observe(container);
    window.addEventListener('resize', onWindowResize);
  }

  // onDestroy runs during SSR too, where document is undefined, so the DOM
  // teardown is guarded to the browser.
  onDestroy(() => {
    if (typeof document === 'undefined') return;
    containerObserver?.disconnect();
    if (onWindowResize) window.removeEventListener('resize', onWindowResize);
    if (settleTimer) clearTimeout(settleTimer);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
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
    // The session remembers the street/satellite/3D selection; a restored 3D
    // view boots with the MapLibre container up and no Leaflet tile layer.
    const restored3D = mapType.toLowerCase() === '3d';
    let threedmap = document.getElementById('threedmap')!;
    if (threedmap) threedmap.style.display = restored3D ? 'block' : 'none';
    leafletMap = L.map(id);
    centerInWindow(mavLocation, zoom);
    if (restored3D) {
      document.getElementById(id)!.style.display = 'none';
      mapType = '3D';
      mapTypeStore.set(mapType);
      mapTileLayerStore.set(null);
    } else if (mapType.toLowerCase() === 'openstreetmap') {
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

    // The display only exists while a window or fullscreen renders the frame,
    // so it resolves per update; a fixed reference taken on a passive page is
    // null and would abort the rest of the map setup.
    function updateLocationDisplay(loc: L.LatLng | { lat: number; lng: number }) {
        const locationDisplay = document.querySelector('#location-display');
        if (!locationDisplay) return;
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
        if (get(patternCaptureStore)) {
          addPatternPoint(e.latlng);
          return;
        }
        openCombinedPopup(e.latlng);
      }, MAP_CLICK_DELAY_MS);
    });
    leafletMap.on('dblclick', (e: L.LeafletMouseEvent) => {
      if (mapClickTimer) {
        clearTimeout(mapClickTimer);
        mapClickTimer = null;
      }
      if (get(patternCaptureStore)) {
        finishPatternCapture();
        return;
      }
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

  // Appending to the plan seeds a takeoff at the vehicle's location first
  // when the mission has none, since nearly every ArduPilot and PX4 mission
  // must begin with a takeoff. Index 0 is the hidden home slot (the panel and
  // the markers skip it), so the plan needs one, and the takeoff check only
  // counts the visible rows.
  function appendToPlan(items: MissionPlanActions[number][], anchor: L.LatLng) {
    const current = get(missionPlanActionsStore);
    const ordered = Object.keys(current)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => current[i]);
    const blank = { notes: '', param1: null, param2: null, param3: null, param4: null };

    const mav = get(mavLocationStore);
    const lat = mav && 'lat' in mav && mav.lat !== 0 ? mav.lat : anchor.lat;
    const lon = mav && 'lng' in mav && mav.lng !== 0 ? mav.lng : anchor.lng;
    const takeoff = () => ({ type: 'NAV_TAKEOFF', lat, lon, alt: DEFAULT_TAKEOFF_ALT_M, ...blank });

    if (ordered.length === 0) ordered.push(takeoff());
    const hasTakeoff = ordered
      .slice(1)
      .some((a) => a.type === 'NAV_TAKEOFF' || a.type === 'NAV_VTOL_TAKEOFF');
    if (!hasTakeoff) ordered.splice(1, 0, takeoff());
    ordered.push(...items);

    const next: MissionPlanActions = {};
    ordered.forEach((item, i) => {
      next[i] = item;
    });
    missionPlanActionsStore.set(next);
  }

  function addWaypoint(latlng: L.LatLng) {
    appendToPlan(
      [
        {
          type: 'NAV_WAYPOINT',
          lat: latlng.lat,
          lon: latlng.lng,
          alt: null,
          notes: '',
          param1: null,
          param2: null,
          param3: null,
          param4: null
        }
      ],
      latlng
    );
  }

  // Pattern capture: the planner collects corner clicks (survey polygon, or
  // the single orbit center), then a parameter prompt generates waypoints.
  let patternPreviewLayer: L.LayerGroup | null = null;

  function drawPatternPreview(corners: { lat: number; lon: number }[]) {
    if (!L || !leafletMap) return;
    patternPreviewLayer?.remove();
    const renderer = paneRenderer('mission', '590');
    const group = L.layerGroup();
    for (const c of corners) {
      L.circleMarker([c.lat, c.lon], {
        radius: 5,
        color: '#f5c518',
        weight: 2,
        fillOpacity: 0.9,
        ...(renderer ? { renderer } : {})
      }).addTo(group);
    }
    if (corners.length >= 2) {
      L.polyline(
        corners.map((c) => [c.lat, c.lon] as [number, number]),
        { color: '#f5c518', dashArray: '6 6', weight: 2, ...(renderer ? { renderer } : {}) }
      ).addTo(group);
    }
    group.addTo(leafletMap);
    patternPreviewLayer = group;
  }

  function clearPatternPreview() {
    patternPreviewLayer?.remove();
    patternPreviewLayer = null;
  }

  function addPatternPoint(latlng: L.LatLng) {
    const capture = get(patternCaptureStore);
    if (!capture) return;
    const corners = [...capture.corners, { lat: latlng.lat, lon: latlng.lng }];
    patternCaptureStore.set({ ...capture, corners });
    drawPatternPreview(corners);
    if (capture.kind === 'orbit') finishPatternCapture();
  }

  function cancelPatternCapture() {
    if (!get(patternCaptureStore)) return;
    patternCaptureStore.set(null);
    clearPatternPreview();
    notify({ title: 'Pattern canceled', content: 'No waypoints were added.', type: 'info' });
  }

  function appendPatternWaypoints(points: PatternPoint[]) {
    if (!points.length) {
      notify({
        title: 'Pattern',
        content: 'Those parameters produce no waypoints; check the spacing against the area size.',
        type: 'warning'
      });
      return;
    }
    appendToPlan(
      points.map((p) => ({
        type: 'NAV_WAYPOINT',
        lat: p.lat,
        lon: p.lon,
        alt: p.alt,
        notes: '',
        param1: null,
        param2: null,
        param3: null,
        param4: null
      })),
      L.latLng(points[0].lat, points[0].lon)
    );
    notify({ title: 'Pattern added', content: `${points.length} waypoints appended to the plan.`, type: 'success' });
  }

  function finishPatternCapture() {
    const capture = get(patternCaptureStore);
    patternCaptureStore.set(null);
    clearPatternPreview();
    if (!capture) return;
    if (capture.kind === 'survey') {
      if (capture.corners.length < 3) {
        notify({
          title: 'Survey pattern',
          content: 'A survey area needs at least three corners.',
          type: 'warning'
        });
        return;
      }
      showModal({
        title: 'Survey pattern',
        content: 'Serpentine transects across the drawn area.',
        confirmation: true,
        confirmLabel: 'Generate',
        inputs: [
          { type: 'number', label: 'Transect spacing (m)', placeholder: 'e.g. 25', required: true },
          { type: 'number', label: 'Grid angle from north (deg)', placeholder: 'e.g. 0', required: true },
          { type: 'number', label: 'Altitude (m)', placeholder: 'e.g. 40', required: true }
        ],
        onConfirm: (values) => {
          appendPatternWaypoints(
            surveyGrid({
              polygon: capture.corners,
              spacingM: Number(values[0]),
              angleDeg: Number(values[1]),
              altM: Number(values[2])
            })
          );
        }
      });
      return;
    }
    showModal({
      title: 'Orbit pattern',
      content: 'A ring of waypoints around the clicked center.',
      confirmation: true,
      confirmLabel: 'Generate',
      inputs: [
        { type: 'number', label: 'Radius (m)', placeholder: 'e.g. 50', required: true },
        { type: 'number', label: 'Waypoints around the circle', placeholder: 'e.g. 12', required: true },
        { type: 'number', label: 'Altitude (m)', placeholder: 'e.g. 30', required: true },
        { type: 'text', label: 'Direction', placeholder: 'cw or ccw', required: true }
      ],
      onConfirm: (values) => {
        appendPatternWaypoints(
          orbit({
            center: capture.corners[0],
            radiusM: Number(values[0]),
            points: Number(values[1]),
            altM: Number(values[2]),
            clockwise: values[3].trim().toLowerCase() !== 'ccw'
          })
        );
      }
    });
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

  const MAV_ICONS = [
    { src: '/map/here.png', label: 'Arrow' },
    { src: '/map/mav-plane.png', label: 'Plane' },
    { src: '/map/mav-jet.png', label: 'Jet' },
    { src: '/map/mav-quad.png', label: 'Quadcopter' },
    { src: '/map/mav-hex.png', label: 'Hexacopter' },
    { src: '/map/mav-boat.png', label: 'Boat' },
    { src: '/map/mav-rover.png', label: 'Rover' }
  ];

  function mavMarkerSectionHtml(): string {
    const current = get(mavIconStore);
    const buttons = MAV_ICONS.map(
      (icon) =>
        `<button type="button" class="am-icon${icon.src === current ? ' am-icon-active' : ''}" data-mav-icon="${icon.src}" title="${icon.label}" aria-label="${icon.label}"><img src="${icon.src}" alt="${icon.label}"></button>`
    ).join('');
    return `<strong>${get(mavTypeStore) || 'Vehicle'} position</strong><br><span class="am-note">Vehicle marker:</span><div class="am-icons">${buttons}</div>`;
  }

  // The modal body is injected HTML, so the icon buttons resolve through one
  // delegated listener instead of per-button handlers.
  function onIconPick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest('[data-mav-icon]') as HTMLElement | null;
    if (!btn || !btn.dataset.mavIcon) return;
    mavIconStore.set(btn.dataset.mavIcon);
    btn.parentElement?.querySelectorAll('.am-icon-active').forEach((el) => el.classList.remove('am-icon-active'));
    btn.classList.add('am-icon-active');
    updateMAVMarker();
  }

  $effect(() => {
    document.addEventListener('click', onIconPick);
    return () => document.removeEventListener('click', onIconPick);
  });

  // Everything under a click, so overlapping airspace, ceilings, obstacles, and
  // mission markers collapse into one popup instead of fighting over the map.
  // Each section carries the accent color of its map layer so the modal cards
  // match the overlays.
  type ScreenProjector = (lat: number, lon: number) => { x: number; y: number };

  function popupSectionsAt(latlng: L.LatLng, project?: ScreenProjector): { html: string; accent: string }[] {
    if (!leafletMap && !project) return [];
    const point = { lat: latlng.lat, lon: latlng.lng };
    const toScreen: ScreenProjector =
      project ??
      ((lat, lon) => leafletMap!.latLngToContainerPoint([lat, lon] as L.LatLngExpression));
    const clickPx = toScreen(latlng.lat, latlng.lng);
    const withinHit = (lat: number, lon: number) => {
      const px = toScreen(lat, lon);
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
    if (get(showTrafficStore)) {
      for (const contact of Object.values(get(trafficStore))) {
        if (withinHit(contact.lat, contact.lon)) sections.push({ html: trafficPopupHtml(contact), accent: '#38bdf8' });
      }
    }

    const missionHits: string[] = [];
    if (mavMarker) {
      const mav = mavMarker.getLatLng();
      if (withinHit(mav.lat, mav.lng)) sections.push({ html: mavMarkerSectionHtml(), accent: '#4e94f7' });
    }
    markers.forEach((marker, index) => {
      const ll = marker.getLatLng();
      if (withinHit(ll.lat, ll.lng)) missionHits.push(`Waypoint ${index}: ${actions[index]?.type ?? ''}`);
    });
    if (missionHits.length) sections.push({ html: `<strong>Mission</strong><br>${missionHits.join('<br>')}`, accent: '#61cd89' });

    return sections;
  }

  function openCombinedPopup(latlng: L.LatLng, project?: ScreenProjector): boolean {
    const sections = popupSectionsAt(latlng, project);
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

  // Hit-testing a 3D click projects features through the MapLibre camera so
  // pitch and bearing keep the same pixel tolerance as the 2D map.
  function openCombinedPopup3D(lat: number, lng: number): boolean {
    const m = get(threeDMapStore);
    if (!m || !L) return false;
    return openCombinedPopup(L.latLng(lat, lng), (la, lo) => m.project([lo, la]));
  }

  let airspaceLayer: L.LayerGroup | null = null;

  function renderAirspace() {
    if (!L || !leafletMap) return;
    airspaceLayer?.remove();
    if (!get(showAirspaceStore) || hideOverlay) {
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
      // A session restored straight into 3D booted Leaflet in a hidden div.
      leafletMap.invalidateSize();
      centerInWindow(get(mavLocationStore) as L.LatLng, get(mapZoomStore));
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
  }

  function toggleCeilings() {
    showCeilingsStore.set(!get(showCeilingsStore));
  }

  function toggleObstacles() {
    showObstaclesStore.set(!get(showObstaclesStore));
  }

  let ceilingLayer: L.LayerGroup | null = null;
  let obstacleLayer: L.LayerGroup | null = null;
  const TRAFFIC_POLL_MS = 5000;
  const M_PER_FT = 0.3048;

  async function refreshTraffic() {
    if (!leafletMap || hideOverlay || !get(showTrafficStore)) return;
    // The 3D map pans independently, so contacts follow whichever view is up.
    const b =
      get(mapTypeStore) === '3D' && threeDMap ? threeDMap.getBounds() : leafletMap.getBounds();
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

  // Contacts arrive per ADSB_VEHICLE message and per network poll, so markers
  // reconcile in place by contact id instead of tearing the layer down.
  const trafficMarkers2D = new Map<string, L.Marker>();

  function renderTraffic() {
    if (!L || !leafletMap) return;
    const contacts = Object.values(get(trafficStore));
    const visible = get(showTrafficStore) && !hideOverlay;
    const live = new Set(contacts.map((c) => c.id));
    for (const [id, marker] of trafficMarkers2D) {
      if (!visible || !live.has(id)) {
        marker.remove();
        trafficMarkers2D.delete(id);
      }
    }
    if (!visible) return;
    for (const c of contacts) {
      let marker = trafficMarkers2D.get(c.id);
      if (!marker) {
        const icon = L.divIcon({
          className: 'traffic-icon',
          html: '<i class="fas fa-plane"></i>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        marker = L.marker([c.lat, c.lon], { icon })
          .on('click', (ev) => openCombinedPopup((ev as L.LeafletMouseEvent).latlng))
          .addTo(leafletMap);
        trafficMarkers2D.set(c.id, marker);
      }
      marker.setLatLng([c.lat, c.lon]);
      const iconEl = marker.getElement()?.querySelector('i') as HTMLElement | null;
      if (iconEl) iconEl.style.transform = `rotate(${(c.headingDeg ?? 0) - 90}deg)`;
    }
  }

  function toggleTraffic() {
    showTrafficStore.set(!get(showTrafficStore));
  }

  // A pane above the polygon fills (overlayPane is 400) but below the mission
  // markers (markerPane is 600), so obstacle dots keep their true color instead
  // of being tinted by the translucent airspace and ceiling overlays.
  // Vector paths render into their renderer's pane, so each overlay gets a
  // dedicated pane and renderer with a fixed z-order: ceilings (402) under
  // airspace (405) under obstacles (450) under mission paths (590) under the
  // markers (Leaflet's markerPane, 600). Sharing one pane makes stacking follow
  // insertion order, which flickers as layers re-render at different cadences.
  // Canvas renderers keep the dense LAANC grid cheap to pan and zoom, where
  // one SVG node per cell makes the DOM crawl.
  const paneRenderers = new Map<string, L.Renderer>();
  function paneRenderer(name: string, zIndex: string): L.Renderer | null {
    if (!L || !leafletMap) return null;
    if (!leafletMap.getPane(name)) {
      leafletMap.createPane(name);
      const pane = leafletMap.getPane(name);
      if (pane) pane.style.zIndex = zIndex;
    }
    if (!paneRenderers.has(name)) paneRenderers.set(name, L.canvas({ pane: name }));
    return paneRenderers.get(name) ?? null;
  }

  function obstaclePaneRenderer(): L.Renderer | null {
    return paneRenderer('obstacles', '450');
  }

  function renderCeilings() {
    if (!L || !leafletMap) return;
    ceilingLayer?.remove();
    if (!get(showCeilingsStore) || hideOverlay) {
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
    if (!get(showObstaclesStore) || hideOverlay) {
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

    polylines.forEach(polyline => {
      if (leafletMap?.hasLayer(polyline)) {
        leafletMap.removeLayer(polyline);
      }
    });
    polylines.clear();
    markersStore.set(markers);
    polylinesStore.set(polylines);
    planPaths = [];
    mavLegLine?.remove();
    mavLegLine = null;
    missionPathsStore.set([]);
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

  function addPolyline(start: L.LatLng, end: L.LatLng, via?: PathPoint[]) {
    const key = generatePolylineKey(start, end);
    removePolyline(start, end); // Ensure no old polyline is left

    const points: PathPoint[] = via && via.length >= 2 ? via : [start, end];
    const latlngs: L.LatLngExpression[] = points.map((p) => [p.lat, p.lng]);
    const renderer = paneRenderer('mission', '590');
    const polyline = L.polyline(latlngs, { color: 'red', ...(renderer ? { renderer } : {}) });
    leafletMap?.addLayer(polyline);
    polylines.set(key, polyline);
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
        const iconIndex = ACTION_TYPES.indexOf(type);

        if (!isNaN(lat) && !isNaN(lon) && iconIndex >= 0) {
          const numericIndex = Number(index);
          const marker = L.marker([lat, lon], { icon: icons[iconIndex], draggable: true })
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

    const drawnPaths: PathPoint[][] = [];
    const markerEntries = Array.from(markers.entries()).sort((a, b) => a[0] - b[0]); // Ensure order by index

    // Spline waypoints fly ArduPilot's hermite curve, so their legs draw the
    // sampled curve instead of a straight line. PX4 substitutes splines with
    // straight waypoints on upload, so its path stays straight.
    const nodes: PathNode[] = markerEntries.map(([index, marker]) => {
      const ll = marker.getLatLng();
      const action = actions[index];
      return {
        lat: ll.lat,
        lng: ll.lng,
        spline: action?.type === 'NAV_SPLINE_WAYPOINT',
        stop: stopsAt(action?.type ?? '', action?.param1)
      };
    });
    const segmentPaths = missionSegmentPaths(nodes, !isPX4());

    for (let i = 0; i < markerEntries.length - 1; i++) {
      const [currentIndex, currentMarker] = markerEntries[i];
      const [, nextMarker] = markerEntries[i + 1];
      let [, prevMarker] = markerEntries[i];
      if (i > 0) [, prevMarker] = markerEntries[i - 1];

      if (currentMarker && nextMarker && currentIndex >= get(missionIndexStore)) {
        let currentLatLng = currentMarker.getLatLng();
        let nextLatLng = nextMarker.getLatLng();
        const path = segmentPaths[i] ?? [currentLatLng, nextLatLng];
        addPolyline(currentLatLng, nextLatLng, path);
        drawnPaths.push(path.map((p) => ({ lat: p.lat, lng: p.lng })));
      }
      if (currentIndex < get(missionIndexStore) && prevMarker) {
        removePolyline(prevMarker.getLatLng(), currentMarker.getLatLng());
      }
    }

    planPaths = drawnPaths;
    updateMavLeg();
  }

  // The vehicle marker updates in place at telemetry rate: position through
  // setLatLng, heading through a CSS rotation, art through the img src.
  // Recreating the marker or re-encoding a rotated canvas per frame burns
  // main-thread time and drops the marker between frames.
  function updateMAVMarker() {
    if (!L || !leafletMap || !mavLocation) return;
    if (!mavMarker) {
      const icon = L.divIcon({
        className: 'mav-marker',
        html: `<img src="${get(mavIconStore)}" alt="Vehicle">`,
        iconSize: [45, 45],
        iconAnchor: [22.5, 22.5]
      });
      mavMarker = L.marker(mavLocation as L.LatLng, { icon })
        .on('click', (ev) => openCombinedPopup((ev as L.LeafletMouseEvent).latlng));
      leafletMap.addLayer(mavMarker);
    }
    mavMarker.setLatLng(mavLocation as L.LatLng);
    const img = mavMarker.getElement()?.querySelector('img');
    if (img) {
      const src = get(mavIconStore);
      if (img.getAttribute('src') !== src) img.src = src;
      img.style.transform = `rotate(${mavHeading}deg)`;
    }
    updateMavLeg();
    if (lockView) {
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

  // The vehicle-to-next-waypoint leg is the only path that moves at telemetry
  // rate; it updates in place while the plan segments rebuild only on plan or
  // progress changes.
  let planPaths: PathPoint[][] = [];
  let mavLegLine: L.Polyline | null = null;

  function updateMavLeg() {
    if (!L || !leafletMap) return;
    const mav = get(mavLocationStore) as L.LatLng | null;
    const target = mav ? markers.get(get(missionIndexStore)) : undefined;
    if (!mav || !target) {
      mavLegLine?.remove();
      mavLegLine = null;
      missionPathsStore.set(planPaths);
      return;
    }
    const targetLatLng = target.getLatLng();
    const points: L.LatLngExpression[] = [
      [mav.lat, mav.lng],
      [targetLatLng.lat, targetLatLng.lng]
    ];
    if (!mavLegLine) {
      const renderer = paneRenderer('mission', '590');
      mavLegLine = L.polyline(points, { color: 'red', ...(renderer ? { renderer } : {}) }).addTo(
        leafletMap
      );
    } else {
      mavLegLine.setLatLngs(points);
    }
    missionPathsStore.set([
      ...planPaths,
      [
        { lat: mav.lat, lng: mav.lng },
        { lat: targetLatLng.lat, lng: targetLatLng.lng }
      ]
    ]);
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
  $effect.pre(() => {
    void $mavIconStore;
    untrack(() => updateMAVMarker());
  });
  // Mission progress redraws the plan segments (reached legs drop off).
  $effect.pre(() => {
    void $missionIndexStore;
    untrack(() => updateMarkersAndPolylines());
  });
  // The window rect changes on every scroll tick, but the fixed map only needs
  // invalidateSize and a recenter when the window actually resizes (a page
  // change, a viewport resize). A pure scroll moves only the CSS frame vars;
  // recentering the Leaflet view on every scroll frame is what lags native
  // scroll on mobile, and the vehicle-follow recenter already lives in the
  // marker update, so scroll is left to reposition the frame alone.
  let trackedWinSize = { width: 0, height: 0 };
  $effect(() => {
    const w = win;
    void isFullscreen;
    untrack(() => {
      if (!leafletMap) return;
      const width = w?.width ?? window.innerWidth;
      const height = w?.height ?? window.innerHeight;
      const resized = width !== trackedWinSize.width || height !== trackedWinSize.height;
      if (resized) {
        trackedWinSize = { width, height };
        leafletMap.invalidateSize();
        centerInWindow(get(mavLocationStore) as L.LatLng, get(mapZoomStore));
      }
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
    void hideOverlay;
    untrack(() => renderAirspace());
  });
  $effect.pre(() => {
    void $ceilingCellsStore;
    void $showCeilingsStore;
    void hideOverlay;
    untrack(() => renderCeilings());
  });
  $effect.pre(() => {
    void $obstaclesStore;
    void $showObstaclesStore;
    void hideOverlay;
    untrack(() => renderObstacles());
  });
  $effect.pre(() => {
    void $trafficStore;
    void $showTrafficStore;
    void hideOverlay;
    untrack(() => renderTraffic());
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

  /* The map layer stacks below the page chrome, so a mini-window tooltip
     hanging past the window edge slips under the nav and cards; in the mini
     state tooltips drop below the buttons and hang inward instead. */
  .map-container.mini .map-btn[data-tip]::after {
    top: calc(100% + 8px);
    bottom: auto;
    left: auto;
    right: 0;
    transform: none;
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
  .map-container.mini :global(.maplibregl-ctrl-attrib),
  .map-container.passive :global(.leaflet-control-attribution),
  .map-container.passive :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  .map-container :global(.traffic-icon i) {
    color: #38bdf8;
    font-size: 16px;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
    display: inline-block;
  }

  .map-container :global(.mav-marker) {
    background: transparent;
    border: none;
  }

  .map-container :global(.mav-marker img) {
    width: 45px;
    height: 45px;
  }

  #map-toggle {
    z-index: 10;
    background-color: var(--secondaryColor);
    border: 2px solid var(--primaryColor);
  }

  #map-toggle > * {
    color: var(--fontColor);
  }

  /* A window shorter than the button stack folds extra buttons into a second
     column growing leftward, so controls never spill past the window edge. */
  .map-controls {
    max-height: calc(var(--wh) - 4.5rem);
    flex-wrap: wrap-reverse;
    align-content: flex-start;
  }

  .map-container.fs .map-controls {
    max-height: calc(100vh - 4.5rem);
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

  /* Each button's sub-1 opacity makes it a stacking context, so a DOM-later
     sibling would paint over the hovered button's tooltip; the raise keeps
     the tooltip above the rest of the stack. */
  .map-btn:hover,
  .map-btn:focus-visible {
    opacity: 0.75;
    transform: scale(1.05);
    z-index: 65;
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

  /* The panel itself never clips (tooltips escape its edges); the bodies clip
     their own content to the bottom radius instead. */
  .dock-panel {
    width: 320px;
    background-color: rgb(from var(--primaryColor) r g b / 0.88);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 0.9);
    border-radius: var(--radius-surface);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  /* The embedded Stats keeps its own rows and button logic; the dock panel
     supplies the surface, so its card chrome and full height come off. */
  .stats-body {
    max-height: 46vh;
    overflow-y: auto;
    border-radius: 0 0 var(--radius-surface) var(--radius-surface);
  }

  /* The scrolling body clips horizontally, so the edge buttons' tooltips
     anchor to their inner side instead of centering past the panel. */
  .stats-body :global(.button-container > div:first-child .tooltip) {
    left: 0;
    transform: none;
  }

  .stats-body :global(.button-container > div:first-child .circular-button:hover .tooltip) {
    transform: translateY(-0.5rem);
  }

  .stats-body :global(.button-container > div:last-child .tooltip) {
    left: auto;
    right: 0;
    transform: none;
  }

  .stats-body :global(.button-container > div:last-child .circular-button:hover .tooltip) {
    transform: translateY(-0.5rem);
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
    overflow: hidden;
    border-radius: 0 0 var(--radius-surface) var(--radius-surface);
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

    .map-controls {
      gap: 0.375rem;
      max-height: calc(var(--wh) - 3.5rem);
    }

    .map-btn {
      width: 2rem;
      height: 2rem;
    }

    .map-btn i {
      font-size: small;
    }

    #map-toggle {
      padding: 0.35rem 0.5rem 0.35rem 0.65rem;
      font-size: 0.75rem;
    }

    /* The attribution bar spans the window bottom at this width, so the
       location pill rides above it instead of overlapping. */
    #location-display {
      font-size: 0.65rem;
      line-height: 1.35;
      max-width: min(78vw, calc(var(--ww) - 3rem));
      bottom: 2.8rem;
      left: 6px;
      padding: 3px 6px;
    }

    .map-container :global(.leaflet-control-attribution),
    .map-container :global(.maplibregl-ctrl-attrib) {
      font-size: 0.6rem;
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
  <ThreeDMap onFeatureClick={openCombinedPopup3D} />
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
    <button class="map-btn" aria-label="Toggle fullscreen" data-tip={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} data-tip-pos="left" onclick={handleFullScreen}>
      <i class="fas fa-expand"></i>
    </button>
    <button class="map-btn {lockPulse ? 'lock-pulse' : ''}" aria-label="Toggle map lock" data-tip={lockView ? 'Unlock map (stop following the vehicle)' : 'Lock map to the vehicle'} data-tip-pos="left" onclick={toggleLockView}>
      <i class="fas {lockView ? 'fa-lock text-[#f5c518]' : 'fa-lock-open'}"></i>
    </button>
    {#if !hideOverlay}
      <button class="map-btn" aria-label="Toggle airspace overlay" data-tip="{$showAirspaceStore ? 'Hide' : 'Show'} airspace zones" data-tip-pos="left" onclick={toggleAirspace}>
        <i class="fas fa-tower-broadcast {$showAirspaceStore ? 'text-[#f24e4e]' : ''}"></i>
      </button>
      <button class="map-btn" aria-label="Toggle LAANC ceiling grid" data-tip="{$showCeilingsStore ? 'Hide' : 'Show'} LAANC ceiling grid (pre-approved altitude per square)" data-tip-pos="left" onclick={toggleCeilings}>
        <i class="fas fa-border-all {$showCeilingsStore ? 'text-[#22c55e]' : ''}"></i>
      </button>
      <button class="map-btn" aria-label="Toggle obstacles" data-tip="{$showObstaclesStore ? 'Hide' : 'Show'} obstacles (FAA towers and tall structures)" data-tip-pos="left" onclick={toggleObstacles}>
        <i class="fas fa-tower-observation {$showObstaclesStore ? 'text-[#f97316]' : ''}"></i>
      </button>
      <button class="map-btn" aria-label="Toggle live air traffic" data-tip="{$showTrafficStore ? 'Hide' : 'Show'} live air traffic (ADS-B)" data-tip-pos="left" onclick={toggleTraffic}>
        <i class="fas fa-plane {$showTrafficStore ? 'text-[#38bdf8]' : ''}"></i>
      </button>
    {/if}
  </div>
  <label id="map-toggle" class="flex justify-center cursor-pointer my-2 absolute top-1 right-2 left-2 w-fit m-auto rounded-3xl p-2 pl-3 text-sm items-center" style={!hideOverlay ? 'display: flex;' : 'display: none;'}>
    <input type="checkbox" value="" class="sr-only peer" onclick={toggleMap}>
    <span class="text-white flex items-center gap-2">
      <i class="fas fa-map"></i>
      <span>{mapType === '3D' ? '3D Buildings' : mapType === 'OpenStreetMap' ? 'Streets' : mapType}</span>
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
            <button class="dock-min" aria-label="Minimize stats" data-tip="Minimize" data-tip-pos="left" onclick={() => (statsDockOpen = false)}>
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
            <button class="dock-min" aria-label="Minimize live feed" data-tip="Minimize" data-tip-pos="left" onclick={() => (feedDockOpen = false)}>
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
            <div class="flex items-center gap-1">
              <button
                class="dock-min"
                aria-label="Toggle gamepad flight"
                data-tip={gamepadActive ? 'Stop gamepad flight' : 'Fly with a gamepad (MANUAL_CONTROL)'}
                onclick={toggleGamepad}
              >
                <i class="fas fa-gamepad {gamepadActive ? 'text-[#61cd89]' : ''}"></i>
              </button>
              <button class="dock-min" aria-label="Minimize manual control" data-tip="Minimize" data-tip-pos="left" onclick={() => (controlDockOpen = false)}>
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
          <div class="control-body">
            <div class="control-col">
              <button class="ctl-btn" aria-label="Altitude up" data-tip="Climb {ALTITUDE_STEP_M} m" data-tip-pos="right" onclick={() => nudgeAltitude(1)}>
                <i class="fas fa-arrow-up"></i>
              </button>
              <button class="ctl-btn" aria-label="Altitude down" data-tip="Descend {ALTITUDE_STEP_M} m" data-tip-pos="right" onclick={() => nudgeAltitude(-1)}>
                <i class="fas fa-arrow-down"></i>
              </button>
            </div>
            <DPad />
            <div class="control-col">
              <button class="ctl-btn" aria-label="Rotate left" data-tip="Yaw left {YAW_STEP_DEG}°" data-tip-pos="left" onclick={() => rotate(-1)}>
                <i class="fas fa-rotate-left"></i>
              </button>
              <button class="ctl-btn" aria-label="Rotate right" data-tip="Yaw right {YAW_STEP_DEG}°" data-tip-pos="left" onclick={() => rotate(1)}>
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
