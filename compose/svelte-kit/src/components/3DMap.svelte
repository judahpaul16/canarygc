<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { mavHeadingStore, mavLocationStore } from '../stores/mavlinkStore';
  import { mapZoomStore, lockViewStore, threeDMapStore, mapWindowStore, mapFullscreenStore } from '../stores/mapStore';
  import { mavIconStore } from '../stores/customizationStore';
  import { airspaceZonesStore, showAirspaceStore } from '../stores/safetyStore';
  import {
    AIRSPACE_CONTROLLED_COLOR,
    AIRSPACE_RESTRICTED_COLOR,
    airspacePopupHtml
  } from '../lib/airspace';
  import { get } from 'svelte/store';
  import pkg, { type GeoJSONSource, type ExpressionSpecification } from 'maplibre-gl';
  const { Map, Marker, NavigationControl, Popup } = pkg;

  let map: pkg.Map | null = $derived($threeDMapStore);
  let marker: pkg.Marker | undefined;
  let markerInterval: ReturnType<typeof setInterval>;

  let mavLocation = $derived($mavLocationStore);

  const airspaceColorExpr: ExpressionSpecification = [
    'case',
    ['get', 'restricted'],
    AIRSPACE_RESTRICTED_COLOR,
    AIRSPACE_CONTROLLED_COLOR
  ];

  function airspaceFeatureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: get(airspaceZonesStore).map((zone) => ({
        type: 'Feature',
        properties: { restricted: zone.restricted, popupHtml: airspacePopupHtml(zone) },
        geometry: { type: 'Polygon', coordinates: zone.polygon }
      }))
    };
  }

  function renderAirspace3D() {
    const m = map;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource('airspace') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(airspaceFeatureCollection());
    const visibility: 'visible' | 'none' = get(showAirspaceStore) ? 'visible' : 'none';
    if (m.getLayer('airspace-fill')) m.setLayoutProperty('airspace-fill', 'visibility', visibility);
    if (m.getLayer('airspace-outline'))
      m.setLayoutProperty('airspace-outline', 'visibility', visibility);
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
      canvasContextAttributes: {antialias: true}
    });
    map = m;
    
    // The 'building' layer in the streets vector source contains building-height
    // data from OpenStreetMap.
    m.on('load', () => {
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
                    'minzoom': 1,
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
                    'http://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
                ],
                'tileSize': 256
            },
            'paint': {
                'raster-opacity': 0.5
            }
        });

        const airspaceVisibility: 'visible' | 'none' = get(showAirspaceStore) ? 'visible' : 'none';
        m.addSource('airspace', { type: 'geojson', data: airspaceFeatureCollection() });
        m.addLayer({
            'id': 'airspace-fill',
            'type': 'fill',
            'source': 'airspace',
            'layout': { 'visibility': airspaceVisibility },
            'paint': { 'fill-color': airspaceColorExpr, 'fill-opacity': 0.12 }
        });
        m.addLayer({
            'id': 'airspace-outline',
            'type': 'line',
            'source': 'airspace',
            'layout': { 'visibility': airspaceVisibility },
            'paint': { 'line-color': airspaceColorExpr, 'line-width': 1 }
        });
        m.on('click', 'airspace-fill', (e) => {
            const html = e.features?.[0]?.properties?.popupHtml;
            if (html) new Popup().setLngLat(e.lngLat).setHTML(String(html)).addTo(m);
        });
        m.on('mouseenter', 'airspace-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', 'airspace-fill', () => { m.getCanvas().style.cursor = ''; });

        m.addControl(
            new NavigationControl({
                visualizePitch: true,
                showZoom: true,
                showCompass: true
            }), 'top-left'
        );
    });

    m.on('zoom', () => {
      mapZoomStore.set(m.getZoom() + 1);
    });

    threeDMapStore.set(m);

    markerInterval = setInterval(() => {
      updateMAVMarker();
    }, 1000);
    })();
  });

  onDestroy(() => {
    if (markerInterval) clearInterval(markerInterval);
  });

  
  // Runs on an interval, so it reads the stores directly rather than the
  // component's derived runes, which would be stale once the effect is torn
  // down (Svelte's derived_inert warning).
  function updateMAVMarker() {
    const m = get(threeDMapStore);
    const location = get(mavLocationStore);
    if (location && m) {
      marker?.remove();
      let img = new Image();
      img.src = get(mavIconStore);
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
          marker = new Marker({ element: canvas });
          marker.setLngLat([location.lng, location.lat]);
          // offset camera bearing
          marker.setRotation(get(mavHeadingStore) - m.getBearing());
          marker.addTo(m);
        }
      };
      if (get(lockViewStore) && !m.isMoving()) {
        // Camera padding centers the aircraft inside the registered window.
        const w = get(mapFullscreenStore) ? null : get(mapWindowStore);
        const padding = w
          ? {
              top: Math.max(0, w.top),
              left: Math.max(0, w.left),
              right: Math.max(0, window.innerWidth - (w.left + w.width)),
              bottom: Math.max(0, window.innerHeight - (w.top + w.height))
            }
          : { top: 0, left: 0, right: 0, bottom: 0 };
        m.jumpTo({
          center: [location.lng, location.lat],
          zoom: get(mapZoomStore) - 1,
          padding
        });
      }
    }
  }

  $effect(() => {
    void $airspaceZonesStore;
    void $showAirspaceStore;
    untrack(() => renderAirspace3D());
  });
</script>

<div id='threedmap' class="relative h-full rounded-2xl z-0"></div>

<style>
  @import url('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css');
</style>
