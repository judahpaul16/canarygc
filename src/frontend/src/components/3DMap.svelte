<script lang="ts">
  import { onMount } from "svelte";
  import { mavHeadingStore, mavLocationStore } from "../stores/mavlinkStore";
  import {
    mapZoomStore,
    lockViewStore,
    threeDMapStore,
    polylinesStore,
  } from "../stores/mapStore";
  import { get } from "svelte/store";
  import pkg from "maplibre-gl";
  const { Map, Marker, NavigationControl } = pkg;

  let map: any;
  let marker: any;
  let polylines = get(polylinesStore);

  $: map = $threeDMapStore;
  $: mavLocation = $mavLocationStore;
  $: mavHeading = $mavHeadingStore;
  $: polylines = $polylinesStore;

  onMount(() => {
    const MAPTILER_KEY = "FzmtxzLwraPRISOg9JeU";
    map = new Map({
      container: "threedmap",
      style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${MAPTILER_KEY}`,
      center: [mavLocation.lng, mavLocation.lat], // starting position [lng, lat]
      zoom: get(mapZoomStore), // starting zoom
      pitch: 45,
      canvasContextAttributes: { antialias: true },
    });

    // The 'building' layer in the streets vector source contains building-height
    // data from OpenStreetMap.
    map.on("load", () => {
      // Initialize empty GeoJSON for polylines
      map.addSource("mission-lines", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Add the polyline layer
      map.addLayer({
        id: "mission-lines",
        type: "line",
        source: "mission-lines",
        paint: {
          "line-color": "#BF93E4",
          "line-width": 5,
          "line-opacity": 0.8,
        },
      });

      // Insert the layer beneath any symbol layer.
      const layers = map.getStyle().layers;
      let labelLayerId;
      for (let i = 0; i < layers.length; i++) {
        // @ts-ignore
        if (layers[i].type === "symbol" && layers[i].layout["text-field"]) {
          labelLayerId = layers[i].id;
          break;
        }
      }

      map.addSource("openmaptiles", {
        url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
        type: "vector",
      });

      map.addLayer(
        {
          id: "3d-buildings",
          source: "openmaptiles",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 1,
          filter: ["!=", ["get", "hide_3d"], true],
          paint: {
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["get", "render_height"],
              0,
              "lightgray",
              200,
              "royalblue",
              400,
              "lightblue",
            ],
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              15,
              0,
              16,
              ["get", "render_height"],
            ],
            "fill-extrusion-base": [
              "case",
              [">=", ["get", "zoom"], 16],
              ["get", "render_min_height"],
              0,
            ],
          },
        },
        labelLayerId
      );

      map.addControl(
        new NavigationControl({
          visualizePitch: true,
          showZoom: true,
          showCompass: true,
        }),
        "top-left"
      );
    });

    map.on("zoom", () => {
      mapZoomStore.set(map.getZoom());
    });

    threeDMapStore.set(map);

    setInterval(() => {
      updateMAVMarker();
      updatePolylines();
    }, 1000);
  });

  function updatePolylines() {
    if (!map || !map.getSource("mission-lines")) return;

    // Convert polylines Map to GeoJSON features
    const features = Array.from(polylines.values()).map((polyline) => {
      const latlngs = polyline.getLatLngs();
      return {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: latlngs.map((latlng: any) => [latlng.lng, latlng.lat]),
        },
      };
    });

    // Update the GeoJSON source
    map.getSource("mission-lines").setData({
      type: "FeatureCollection",
      features: features,
    });
  }

  function updateMAVMarker() {
    if (mavLocation) {
      marker?.remove();
      let img = new Image();
      img.src = "/map/here.png"; // Use static path directly
      img.onload = () => {
        let canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        let ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.translate(img.width / 2, img.height / 2);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          ctx.save();
          canvas.style.width = "50px";
          canvas.style.height = "50px";
          marker = new Marker({ element: canvas });
          marker.setLngLat([mavLocation.lng, mavLocation.lat]);
          // offset camera bearing
          marker.setRotation(mavHeading - map.getBearing());
          marker.addTo(map);
        }
      };
      if (get(lockViewStore) && !map.isMoving()) {
        map.jumpTo({
          center: [mavLocation.lng, mavLocation.lat],
          zoom: get(mapZoomStore),
          speed: 0.5,
          curve: 1,
        });
      }
    }
  }
</script>

<div id="threedmap" class="relative h-full rounded-2xl z-0"></div>

<style>
  @import url("https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css");
</style>
