<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { mavLocationStore, mavTypeStore } from '../stores/mavlinkStore';
  import {
    smoothLocationStore,
    smoothHeadingStore,
    smoothRollStore,
    smoothPitchStore,
    smoothAltitudeStore
  } from '../lib/smooth-telemetry';
  import { mapZoomStore, lockViewStore, lockNudgeStore, mapTypeStore, threeDMapStore, mapWindowStore, mapFullscreenStore, missionPathsStore } from '../stores/mapStore';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { createMav3DLayer, type Mav3DState } from '../lib/mav-3d-layer';
  import { vehicleClass } from '../lib/flight-modes';
  import {
    airspaceZonesStore,
    showAirspaceStore,
    ceilingCellsStore,
    showCeilingsStore,
    obstaclesStore,
    showObstaclesStore,
    tfrOverlaysStore
  } from '../stores/safetyStore';
  import { trafficStore, trafficThreatsStore, showTrafficStore } from '../stores/trafficStore';
  import { missionPlanActionsStore } from '../stores/missionPlanStore';
  import { actionMarkerSrc } from '../lib/mission-icons';
  import {
    AIRSPACE_CONTROLLED_COLOR,
    AIRSPACE_RESTRICTED_COLOR,
    tfrZones
  } from '../lib/airspace';
  import { ceilingColor, feetToMeters, obstacleColor } from '../lib/hazards';
  import { fetchAirspaceForBbox, fetchHazardsForBbox } from '../lib/preflight';
  import { get } from 'svelte/store';
  import pkg, { type GeoJSONSource, type ExpressionSpecification } from 'maplibre-gl';
  const { Map, Marker, NavigationControl } = pkg;

  interface Props {
    onFeatureClick?: (lat: number, lng: number) => void;
  }

  let { onFeatureClick }: Props = $props();

  let map: pkg.Map | null = $derived($threeDMapStore);

  let mavLocation = $derived($mavLocationStore);
  let win = $derived($mapWindowStore);
  let hideOverlay = $derived($mapFullscreenStore ? false : win ? !win.overlay : true);

  const airspaceColorExpr: ExpressionSpecification = [
    'case',
    ['get', 'restricted'],
    AIRSPACE_RESTRICTED_COLOR,
    AIRSPACE_CONTROLLED_COLOR
  ];

  const featureColorExpr: ExpressionSpecification = ['get', 'color'];

  function airspaceFeatureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: get(airspaceZonesStore).map((zone) => ({
        type: 'Feature',
        properties: { restricted: zone.restricted },
        geometry: { type: 'Polygon', coordinates: zone.polygon }
      }))
    };
  }

  function tfrFeatureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: tfrZones(get(tfrOverlaysStore)).map((zone) => ({
        type: 'Feature',
        properties: { ceilingM: zone.upperM ?? 0 },
        geometry: { type: 'Polygon', coordinates: zone.polygon }
      }))
    };
  }

  function ceilingFeatureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: get(ceilingCellsStore).map((cell) => ({
        type: 'Feature',
        properties: { color: ceilingColor(cell.ceilingFt), ceilingM: feetToMeters(cell.ceilingFt) },
        geometry: { type: 'Polygon', coordinates: cell.polygon }
      }))
    };
  }

  function obstacleFeatureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: get(obstaclesStore).map((obstacle) => ({
        type: 'Feature',
        properties: { color: obstacleColor(obstacle.aglFt) },
        geometry: { type: 'Point', coordinates: [obstacle.lon, obstacle.lat] }
      }))
    };
  }

  function missionFeatureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: get(missionPathsStore)
        .filter((path) => path.length >= 2)
        .map((path) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: path.map((p) => [p.lng, p.lat]) }
        }))
    };
  }

  // One persistent source updated in place; tearing sources down per change
  // drops the lines for a frame on the GPU render loop.
  function renderMissionPaths3D() {
    const m = map;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource('mission') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(missionFeatureCollection());
  }

  // Mission markers reconcile in place, keyed by plan index; index 0 is the
  // hidden home slot. Recreating them per plan change blinks like the old MAV
  // marker did.
  let missionMarkers = new globalThis.Map<number, pkg.Marker>();

  function renderMissionMarkers3D() {
    const m = map;
    if (!m) return;
    const actions = get(missionPlanActionsStore);
    const live = new Set<number>();
    for (const key of Object.keys(actions)) {
      const index = Number(key);
      if (index === 0) continue;
      const action = actions[index];
      const src = action ? actionMarkerSrc(action.type) : null;
      // A location-less command (return-to-launch, at 0/0) carries no marker.
      if (!action || !src || isNaN(action.lat) || isNaN(action.lon)) continue;
      if (action.lat === 0 && action.lon === 0) continue;
      live.add(index);
      let marker = missionMarkers.get(index);
      if (!marker) {
        const img = new Image();
        img.style.width = '50px';
        img.style.height = '50px';
        img.style.cursor = 'pointer';
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          const ll = missionMarkers.get(index)?.getLngLat();
          if (ll) onFeatureClick?.(ll.lat, ll.lng);
        });
        marker = new Marker({ element: img }).setLngLat([action.lon, action.lat]).addTo(m);
        missionMarkers.set(index, marker);
      }
      const img = marker.getElement() as HTMLImageElement;
      if (img.getAttribute('src') !== src) img.src = src;
      marker.setLngLat([action.lon, action.lat]);
    }
    for (const [index, marker] of missionMarkers) {
      if (!live.has(index)) {
        marker.remove();
        missionMarkers.delete(index);
      }
    }
  }

  function setLayerVisibility(m: pkg.Map, ids: string[], visible: boolean) {
    const visibility: 'visible' | 'none' = visible ? 'visible' : 'none';
    for (const layerId of ids) {
      if (m.getLayer(layerId)) m.setLayoutProperty(layerId, 'visibility', visibility);
    }
  }

  function renderAirspace3D() {
    const m = map;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource('airspace') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(airspaceFeatureCollection());
    setLayerVisibility(m, ['airspace-fill', 'airspace-outline'], get(showAirspaceStore) && !hideOverlay);
  }

  // Active TFRs draw whenever present, independent of the airspace toggle.
  function renderTfrs3D() {
    const m = map;
    if (!m) return;
    const source = m.getSource('tfr') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(tfrFeatureCollection());
    setLayerVisibility(m, ['tfr-fill', 'tfr-outline', 'tfr-volume'], !hideOverlay);
  }

  function renderCeilings3D() {
    const m = map;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource('ceilings') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(ceilingFeatureCollection());
    setLayerVisibility(
      m,
      ['ceilings-fill', 'ceilings-outline', 'ceilings-volume'],
      get(showCeilingsStore) && !hideOverlay
    );
  }

  function renderObstacles3D() {
    const m = map;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource('obstacles') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(obstacleFeatureCollection());
    setLayerVisibility(m, ['obstacles-circle'], get(showObstaclesStore) && !hideOverlay);
  }

  // Traffic contacts are DOM markers so each one rotates to its track and
  // takes a click; the map keys them by contact id and prunes stale ones.
  let trafficMarkers = new globalThis.Map<string, pkg.Marker>();

  function renderTraffic3D() {
    const m = map;
    if (!m) return;
    const contacts = get(trafficStore);
    const threats = get(trafficThreatsStore);
    const visible = get(showTrafficStore) && !hideOverlay;
    for (const [contactId, marker] of trafficMarkers) {
      if (!visible || !contacts[contactId]) {
        marker.remove();
        trafficMarkers.delete(contactId);
      }
    }
    if (!visible) return;
    for (const contact of Object.values(contacts)) {
      let marker = trafficMarkers.get(contact.id);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'traffic-icon';
        el.innerHTML = '<i class="fas fa-plane"></i>';
        el.style.cursor = 'pointer';
        const contactId = contact.id;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const ll = trafficMarkers.get(contactId)?.getLngLat();
          if (ll) onFeatureClick?.(ll.lat, ll.lng);
        });
        marker = new Marker({ element: el, rotationAlignment: 'map' })
          .setLngLat([contact.lon, contact.lat])
          .addTo(m);
        trafficMarkers.set(contactId, marker);
      }
      marker.setLngLat([contact.lon, contact.lat]);
      marker.setRotation((contact.headingDeg ?? 0) - 90);
      marker.getElement().classList.toggle('traffic-threat', threats.has(contact.id));
    }
  }

  // Terrain height under the vehicle, sampled outside the GL render pass on a
  // roughly one-meter grid. Sampling inside the layer's render re-dirties the
  // map every frame and locks the page into a repaint loop.
  let mavGround = 0;
  let mavGroundKey = '';

  function sampleGround(m: pkg.Map, loc: { lat: number; lng: number }) {
    const key = `${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
    if (key === mavGroundKey) return;
    let elevation: number | null = null;
    try {
      elevation = m.queryTerrainElevation([loc.lng, loc.lat]);
    } catch {
      elevation = null;
    }
    // A null read means the terrain is not ready here yet, so the sample
    // stays uncommitted and the next frame retries.
    if (elevation == null) return;
    mavGround = elevation;
    mavGroundKey = key;
  }

  // The MAV renders as a three.js model at its true flight altitude through a
  // custom layer; this getter hands it the current smoothed pose each frame.
  function mav3DState(): Mav3DState | null {
    const loc = get(smoothLocationStore);
    if (!loc) return null;
    return {
      lat: loc.lat,
      lng: loc.lng,
      heightM: get(smoothAltitudeStore),
      ground: mavGround,
      headingDeg: get(smoothHeadingStore),
      rollDeg: get(smoothRollStore),
      pitchDeg: get(smoothPitchStore),
      cls: vehicleClass(get(mavTypeStore))
    };
  }

  let followZoom = Number.NaN;
  let followPadKey = '';

  function followCamera(m: pkg.Map, loc: { lat: number; lng: number }) {
    // Camera moves cost a full MapLibre render; skip them while the 3D view
    // is hidden behind the 2D map. The next telemetry frame after switching
    // to 3D catches the camera up.
    if (get(mapTypeStore) !== '3D' || !get(lockViewStore) || m.isMoving()) return;
    const zoom = get(mapZoomStore) - 1;
    const w = get(mapFullscreenStore) ? null : get(mapWindowStore);
    const padKey = w
      ? `${w.top},${w.left},${w.width},${w.height},${window.innerWidth},${window.innerHeight}`
      : 'full';
    // Zoom and padding stick on the transform once set, so steady follow
    // ticks move only the center and skip moves under half a pixel.
    if (zoom === followZoom && padKey === followPadKey) {
      const c = m.getCenter();
      const degPerPxLng = 360 / (512 * 2 ** zoom);
      const degPerPxLat = degPerPxLng * Math.cos((loc.lat * Math.PI) / 180);
      if (
        Math.abs(loc.lng - c.lng) < degPerPxLng * 0.5 &&
        Math.abs(loc.lat - c.lat) < degPerPxLat * 0.5
      ) {
        return;
      }
      m.jumpTo({ center: [loc.lng, loc.lat] });
      return;
    }
    followZoom = zoom;
    followPadKey = padKey;
    // Camera padding centers the vehicle inside the registered window.
    const padding = w
      ? {
          top: Math.max(0, w.top),
          left: Math.max(0, w.left),
          right: Math.max(0, window.innerWidth - (w.left + w.width)),
          bottom: Math.max(0, window.innerHeight - (w.top + w.height))
        }
      : { top: 0, left: 0, right: 0, bottom: 0 };
    m.jumpTo({
      center: [loc.lng, loc.lat],
      zoom,
      padding
    });
  }

  // Refetch overlays for the visible area as the operator pans the 3D view,
  // mirroring the 2D map's debounce and zoom floor (Leaflet zoom = this + 1).
  const VIEWPORT_REFRESH_DELAY_MS = 500;
  const MIN_OVERLAY_ZOOM = 9;
  let viewportTimer: ReturnType<typeof setTimeout> | null = null;

  function refreshViewportOverlays3D() {
    const m = map;
    if (!m || hideOverlay || m.getZoom() + 1 < MIN_OVERLAY_ZOOM) return;
    const b = m.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    if (get(showAirspaceStore)) fetchAirspaceForBbox(bbox);
    if (get(showCeilingsStore) || get(showObstaclesStore)) fetchHazardsForBbox(bbox);
  }

  onMount(() => {
    void (async () => {
    let maptilerKey = '';
    try {
      const res = await fetch('/api/map-config');
      if (res.ok) maptilerKey = (await res.json()).maptilerKey || '';
    } catch {
      // fall through to the keyless vector style
    }
    // MapTiler's vector style when a key is set, otherwise OpenFreeMap's keyless
    // Liberty style. Both carry the OpenMapTiles building schema the 3D
    // extrusion layer reads.
    const style = maptilerKey
      ? `https://api.maptiler.com/maps/basic-v2/style.json?key=${maptilerKey}`
      : 'https://tiles.openfreemap.org/styles/liberty';
    const m = new Map({
      container: 'threedmap',
      style,
      center: [mavLocation.lng, mavLocation.lat], // starting position [lng, lat]
      zoom: get(mapZoomStore) - 1, // starting zoom
      pitch: 45,
      maxPitch: 85, // let the operator tilt low to read terrain relief
      fadeDuration: 0,
      canvasContextAttributes: {antialias: true}
    });
    map = m;

    // The 'building' layer in the streets vector source contains building-height
    // data from OpenStreetMap.
    m.on('load', () => {
        // Real 3D terrain from a free, keyless raster-DEM: MapTiler terrain-RGB
        // when a key is set, otherwise AWS Open Data terrain tiles. The satellite
        // drape and every overlay sit on the relief, so the map is genuinely 3D
        // without a paid or token-gated globe engine.
        if (!m.getSource('terrain-dem')) {
            if (maptilerKey) {
                m.addSource('terrain-dem', {
                    type: 'raster-dem',
                    tiles: [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${maptilerKey}`],
                    encoding: 'mapbox',
                    tileSize: 256,
                    maxzoom: 12
                });
            } else {
                m.addSource('terrain-dem', {
                    type: 'raster-dem',
                    tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
                    encoding: 'terrarium',
                    tileSize: 256,
                    maxzoom: 15,
                    attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a>'
                });
            }
        }
        m.setTerrain({ source: 'terrain-dem', exaggeration: 1 });

        // A ground sample taken before the terrain tiles arrive reads zero and
        // a parked vehicle never re-keys it, leaving the model under the
        // terrain, so terrain loads invalidate the sample.
        m.on('sourcedata', (e) => {
            if (e.sourceId === 'terrain-dem' && e.isSourceLoaded) mavGroundKey = '';
        });

        // Insert the layer beneath any symbol layer.
        const layers = m.getStyle().layers;

        let labelLayerId;
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            if (layer.type === 'symbol' && layer.layout?.['text-field']) {
                labelLayerId = layer.id;
                break;
            }
        }

        // With a key, add MapTiler's vector source; the keyless OpenFreeMap
        // style already ships an openmaptiles source, so only add when absent.
        if (maptilerKey && !m.getSource('openmaptiles')) {
            m.addSource('openmaptiles', {
                url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${maptilerKey}`,
                type: 'vector',
            });
        }

        if (m.getSource('openmaptiles')) {
            m.addLayer(
                {
                    'id': '3d-buildings',
                    'source': 'openmaptiles',
                    'source-layer': 'building',
                    'type': 'fill-extrusion',
                    // Heights ramp in from zoom 15, so below that the layer
                    // only adds flat geometry cost across a wide view.
                    'minzoom': 15,
                    'filter': ['!=', ['get', 'hide_3d'], true],
                    'paint': {
                        'fill-extrusion-color': [
                            'interpolate',
                            ['linear'],
                            ['coalesce', ['get', 'render_height'], 0], 0, 'gray', 200, 'royalblue', 400, 'lightblue'
                        ],
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            16,
                            ['coalesce', ['get', 'render_height'], 0]
                        ],
                        'fill-extrusion-base': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            16,
                            ['coalesce', ['get', 'render_min_height'], 0]
                        ]
                    }
                },
                labelLayerId
            );
        }

        // Add satellite overlay
        m.addLayer({
            'id': 'satellite',
            'type': 'raster',
            'source': {
                'type': 'raster',
                'tiles': [
                    'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
                ],
                'tileSize': 256
            },
            'paint': {
                'raster-opacity': 0.5
            }
        });

        // Overlay stack mirrors the 2D pane order: ceilings under airspace
        // under obstacles; mission lines and DOM markers land above them.
        m.addSource('ceilings', { type: 'geojson', data: ceilingFeatureCollection() });
        m.addLayer({
            'id': 'ceilings-fill',
            'type': 'fill',
            'source': 'ceilings',
            'layout': { 'visibility': 'none' },
            'paint': { 'fill-color': featureColorExpr, 'fill-opacity': 0.22 }
        });
        m.addLayer({
            'id': 'ceilings-outline',
            'type': 'line',
            'source': 'ceilings',
            'layout': { 'visibility': 'none' },
            'paint': { 'line-color': featureColorExpr, 'line-width': 0.5 }
        });
        // Each grid cell rises to its authorized ceiling; zero-ceiling cells
        // stay in the flat fill.
        m.addLayer({
            'id': 'ceilings-volume',
            'type': 'fill-extrusion',
            'source': 'ceilings',
            'layout': { 'visibility': 'none' },
            'filter': ['>', ['get', 'ceilingM'], 0],
            'paint': {
                'fill-extrusion-color': featureColorExpr,
                'fill-extrusion-height': ['get', 'ceilingM'],
                'fill-extrusion-opacity': 0.22
            }
        });

        m.addSource('airspace', { type: 'geojson', data: airspaceFeatureCollection() });
        m.addLayer({
            'id': 'airspace-fill',
            'type': 'fill',
            'source': 'airspace',
            'layout': { 'visibility': 'none' },
            'paint': { 'fill-color': airspaceColorExpr, 'fill-opacity': 0.12 }
        });
        m.addLayer({
            'id': 'airspace-outline',
            'type': 'line',
            'source': 'airspace',
            'layout': { 'visibility': 'none' },
            'paint': { 'line-color': airspaceColorExpr, 'line-width': 1 }
        });

        m.addSource('tfr', { type: 'geojson', data: tfrFeatureCollection() });
        m.addLayer({
            'id': 'tfr-fill',
            'type': 'fill',
            'source': 'tfr',
            'layout': { 'visibility': 'none' },
            'paint': { 'fill-color': AIRSPACE_RESTRICTED_COLOR, 'fill-opacity': 0.28 }
        });
        m.addLayer({
            'id': 'tfr-outline',
            'type': 'line',
            'source': 'tfr',
            'layout': { 'visibility': 'none' },
            'paint': { 'line-color': AIRSPACE_RESTRICTED_COLOR, 'line-width': 2, 'line-dasharray': [3, 2] }
        });
        // The restriction as a volume from the surface to its ceiling.
        m.addLayer({
            'id': 'tfr-volume',
            'type': 'fill-extrusion',
            'source': 'tfr',
            'layout': { 'visibility': 'none' },
            'filter': ['>', ['get', 'ceilingM'], 0],
            'paint': {
                'fill-extrusion-color': AIRSPACE_RESTRICTED_COLOR,
                'fill-extrusion-height': ['get', 'ceilingM'],
                'fill-extrusion-opacity': 0.18
            }
        });

        m.addSource('obstacles', { type: 'geojson', data: obstacleFeatureCollection() });
        m.addLayer({
            'id': 'obstacles-circle',
            'type': 'circle',
            'source': 'obstacles',
            'layout': { 'visibility': 'none' },
            'paint': {
                'circle-radius': 5,
                'circle-color': featureColorExpr,
                'circle-opacity': 0.9,
                'circle-stroke-width': 2,
                'circle-stroke-color': featureColorExpr
            }
        });

        // Mission legs sit above every overlay, mirroring the 2D pane order.
        m.addSource('mission', { type: 'geojson', data: missionFeatureCollection() });
        m.addLayer({
            'id': 'mission-line',
            'type': 'line',
            'source': 'mission',
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': { 'line-color': '#BF93E4', 'line-width': 5 }
        });

        for (const hoverLayer of ['airspace-fill', 'tfr-fill', 'ceilings-fill', 'obstacles-circle']) {
            m.on('mouseenter', hoverLayer, () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', hoverLayer, () => { m.getCanvas().style.cursor = ''; });
        }

        renderAirspace3D();
        renderTfrs3D();
        renderCeilings3D();
        renderObstacles3D();
        renderMissionPaths3D();
        renderMissionMarkers3D();

        // The vehicle rides above the terrain as a 3D model of its type.
        if (!m.getLayer('mav-3d')) m.addLayer(createMav3DLayer(mav3DState));

        m.addControl(
            new NavigationControl({
                visualizePitch: true,
                showZoom: true,
                showCompass: true
            }), 'top-left'
        );
    });

    // Every feature under a click resolves through the same combined modal as
    // the 2D map.
    m.on('click', (e) => {
      onFeatureClick?.(e.lngLat.lat, e.lngLat.lng);
    });

    m.on('zoom', () => {
      mapZoomStore.set(m.getZoom() + 1);
    });

    // Dragging while the camera is locked snaps back on the next telemetry
    // fix; the lock button pulses so the snap reads as the lock, not a hang.
    m.on('dragstart', () => {
      if (get(lockViewStore)) lockNudgeStore.update((n) => n + 1);
    });

    m.on('moveend', () => {
      if (viewportTimer) clearTimeout(viewportTimer);
      viewportTimer = setTimeout(refreshViewportOverlays3D, VIEWPORT_REFRESH_DELAY_MS);
    });

    threeDMapStore.set(m);
    })();
  });

  onDestroy(() => {
    if (viewportTimer) clearTimeout(viewportTimer);
    if (poseTrailer) clearTimeout(poseTrailer);
    if (map?.getLayer('mav-3d')) map.removeLayer('mav-3d');
    for (const marker of trafficMarkers.values()) marker.remove();
    trafficMarkers.clear();
    for (const marker of missionMarkers.values()) marker.remove();
    missionMarkers.clear();
  });

  // Smoothed pose stores tick every animation frame, and each repaint or
  // camera move costs a full terrain render, so pose-driven renders are paced
  // to this floor with a trailing call that lands the settled pose.
  const POSE_FRAME_MS = 30;
  let poseRenderedAt = 0;
  let poseTrailer: ReturnType<typeof setTimeout> | null = null;

  function renderPose(m: pkg.Map) {
    const loc = get(smoothLocationStore);
    if (!loc || get(mapTypeStore) !== '3D') return;
    sampleGround(m, loc);
    m.triggerRepaint();
    followCamera(m, loc);
  }

  $effect(() => {
    void $smoothLocationStore;
    void $smoothHeadingStore;
    void $smoothRollStore;
    void $smoothPitchStore;
    void $smoothAltitudeStore;
    void $mavTypeStore;
    const m = map;
    untrack(() => {
      if (!m) return;
      // Repaint only while the 3D view is on screen; the hidden 3D canvas stays
      // idle in the 2D view, so the model costs nothing there. The custom layer
      // reads the live pose in its own render pass, so one repaint per fix drives
      // the redraw when the camera is not already following.
      if (get(mapTypeStore) !== '3D') return;
      const wait = POSE_FRAME_MS - (performance.now() - poseRenderedAt);
      if (wait > 0) {
        poseTrailer ??= setTimeout(() => {
          poseTrailer = null;
          poseRenderedAt = performance.now();
          renderPose(m);
        }, wait);
        return;
      }
      poseRenderedAt = performance.now();
      renderPose(m);
    });
  });

  $effect(() => {
    void $airspaceZonesStore;
    void $showAirspaceStore;
    void hideOverlay;
    untrack(() => renderAirspace3D());
  });
  $effect(() => {
    void $tfrOverlaysStore;
    void hideOverlay;
    untrack(() => renderTfrs3D());
  });
  $effect(() => {
    void $ceilingCellsStore;
    void $showCeilingsStore;
    void hideOverlay;
    untrack(() => renderCeilings3D());
  });
  $effect(() => {
    void $obstaclesStore;
    void $showObstaclesStore;
    void hideOverlay;
    untrack(() => renderObstacles3D());
  });
  $effect(() => {
    void $trafficStore;
    void $trafficThreatsStore;
    void $showTrafficStore;
    void hideOverlay;
    untrack(() => renderTraffic3D());
  });
  $effect(() => {
    void $missionPathsStore;
    untrack(() => renderMissionPaths3D());
  });
  $effect(() => {
    void $missionPlanActionsStore;
    const m = map;
    untrack(() => {
      if (m) renderMissionMarkers3D();
    });
  });
</script>

<div id='threedmap' class="relative h-full z-0"></div>

<style>
  /* Inset the zoom/compass controls and attribution off the corners so they
     clear the rounded map edge instead of hugging it, matching the 2D map. */
  #threedmap :global(.maplibregl-ctrl-top-left) { top: 14px; left: 14px; }
  #threedmap :global(.maplibregl-ctrl-top-right) { top: 14px; right: 14px; }
  #threedmap :global(.maplibregl-ctrl-bottom-left) { bottom: 14px; left: 14px; }
  #threedmap :global(.maplibregl-ctrl-bottom-right) { bottom: 14px; right: 14px; }
  #threedmap :global(.maplibregl-ctrl) { margin: 0; }
</style>
