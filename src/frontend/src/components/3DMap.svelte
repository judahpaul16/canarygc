<script lang="ts">
  import { run } from 'svelte/legacy';
  import { onMount } from 'svelte';
  import { mavHeadingStore, mavLocationStore } from '../stores/mavlinkStore';
  import { mapZoomStore, lockViewStore, threeDMapStore } from '../stores/mapStore';
  import { get } from 'svelte/store';
  import pkg from 'maplibre-gl';
  const { Map, Marker, NavigationControl } = pkg;

  let map: any = $state();
  let marker: any;
  let lastPosition = {
    lng: 0,
    lat: 0
  };

  run(() => {
    map = $threeDMapStore;
  });
  let mavLocation = $derived($mavLocationStore);
  let mavHeading = $derived($mavHeadingStore);

  function loadScrript() {
    const script = document.createElement('script');
    script.src = '/js/maplibre-preload.modern.js';
    script.async = true;
    script.onload = () => {
      console.log('Maplibre GL JS loaded');
    };
    document.body.appendChild(script);
  }

  onMount(() => {
    loadScrript();

    const MAPTILER_KEY = 'FzmtxzLwraPRISOg9JeU';
    map = new Map({
      container: 'threedmap',
      style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${MAPTILER_KEY}`,
      center: [mavLocation.lng, mavLocation.lat],
      zoom: get(mapZoomStore),
      pitch: 45,
      canvasContextAttributes: {antialias: true}
    });
    
    map.on('load', () => {
        // Insert the layer beneath any symbol layer.
        const layers = map.getStyle().layers;

        let labelLayerId;
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
                labelLayerId = layers[i].id;
                break;
            }
        }

        map.addSource('openmaptiles', {
            url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
            type: 'vector',
        });

        map.addLayer(
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
                        ['get', 'render_height'], 0, 'lightgray', 200, 'royalblue', 400, 'lightblue'
                    ],
                    'fill-extrusion-height': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        16,
                        ['get', 'render_height']
                    ],
                    'fill-extrusion-base': ['case',
                        ['>=', ['get', 'zoom'], 16],
                        ['get', 'render_min_height'], 0
                    ]
                }
            },
            labelLayerId
        );

        map.addControl(
            new NavigationControl({
                visualizePitch: true,
                showZoom: true,
                showCompass: true
            }), 'top-left'
        );

        // Store initial position
        lastPosition = {
          lng: mavLocation.lng,
          lat: mavLocation.lat
        };
    });

    map.on('zoom', () => {
      mapZoomStore.set(map.getZoom());
    });

    threeDMapStore.set(map);

    setInterval(() => {
      updateMAVMarker();
    }, 1000);
  });

  function updateMAVMarker() {
    if (mavLocation) {
      marker?.remove();
      let img = new Image();
      img.src = '/map/here.png';
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
          marker.setLngLat([mavLocation.lng, mavLocation.lat]);
          marker.setRotation(mavHeading - map.getBearing());
          marker.addTo(map);
        }
      };

      // Only update map position if locked and distance changed significantly
      if (get(lockViewStore) && !map.isMoving() && 
          (Math.abs(lastPosition.lng - mavLocation.lng) > 0.0001 || 
           Math.abs(lastPosition.lat - mavLocation.lat) > 0.0001)) {
        
        // Preload tiles before movement
        map.cachedJumpTo({
          center: [mavLocation.lng, mavLocation.lat],
          zoom: get(mapZoomStore),
          run: false, // Don't execute movement yet, just preload
          debug: false // Set to true to see preloading logs
        });

        // Then execute the actual movement
        map.jumpTo({
          center: [mavLocation.lng, mavLocation.lat],
          zoom: get(mapZoomStore),
          speed: 0.5,
          curve: 1
        });

        // Update last known position
        lastPosition = {
          lng: mavLocation.lng,
          lat: mavLocation.lat
        };
      }
    }
  }
</script>

<div id='threedmap' class="relative h-full rounded-2xl z-0"></div>

<style>
  @import url('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css');
</style>
