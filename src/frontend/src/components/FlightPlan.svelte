<script lang="ts">
  import { onMount } from 'svelte';
  import { mapStore, mavLocationStore } from '../stores/mapStore';
  import { get } from 'svelte/store';
  
  let L: typeof import('leaflet');
  let actions: number[] = [1];
  let action_types = [
    'WAYPOINT', 'SPLINE_WAYPOINT', 'TAKEOFF', 'RETURN_TO_LAUNCH', 'GUIDED_ENABLE', 'LAND',
    'LOITER_TIME', 'LOITER_TURNS', 'LOITER_UNLIM', 'PAYLOAD_PLACE', 'DO_WINCH', 'DO_SET_CAM_TRIGG_DIST',
    'DO_SET_SERVO', 'DO_REPEAT_SERVO', 'DO_DIGICAM_CONFIGURE', 'DO_DIGICAM_CONTROL', 'DO_FENCE_ENABLE',
    'DO_ENGINE_CONTROL', 'CONDITION_DELAY', 'CONDITION_CHANGE_ALT', 'CONDITION_DISTANCE', 'CONDITION_YAW'
  ];
  let action_markers = [
    'map/waypoint.png', 'map/waypoint.png', 'map/takeoff.png', 'map/rtl.png', 'map/guided_enable.png', 'map/land.png',
    'map/loiter.png', 'map/loiter.png', 'map/loiter.png', 'map/payload_place.png', 'map/do_winch.png', 'map/camera.png',
    'map/do_set_servo.png', 'map/do_repeat_servo.png', 'map/camera.png', 'map/camera.png', 'map/do_fence_enable.png',
    'map/do_engine_control.png', 'map/delay.png', 'map/condition_change_alt.png', 'map/condition_distance.png', 'map/condition_yaw.png'
  ];
  let icons: L.Icon[] = [];

  let selectedActions: string[] = Array(actions.length).fill('WAYPOINT');

  let map: L.Map | null = null;
  let markers: Map<number, L.Marker> = new Map(); // Map to keep track of markers
  let polylines: Map<string, L.Polyline> = new Map(); // Map to keep track of polylines

  mapStore.subscribe((value: L.Map | null) => {
    map = value;
  });

  onMount(async () => {
    const module = await import('leaflet');
    L = module;
    
    icons = action_markers.map((marker) => {
      return L.icon({
        iconUrl: marker,
        iconSize: [45, 45],
        iconAnchor: [23, 45],
        popupAnchor: [0, -45],
        shadowSize: [41, 41]
      });
    });

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    function resizeInput() {
      input.style.width = '162px';
      input.style.width = `${input.scrollWidth}px`;
    }
    resizeInput();
    input.style.width = '162px';
    input.addEventListener('input', resizeInput);
  });

  function addAction() {
    actions = [...actions, actions.length + 1];
  }

  function removeAction(index: number) {
    actions = actions.filter((_, i) => i !== index);
    if (markers.has(index)) {
      map?.removeLayer(markers.get(index)!); // Remove marker from the map
      markers.delete(index); // Remove marker from the map reference
    }
    
    // Remove related polylines
    removeConnectedPolylines(index);
  }

  function removeConnectedPolylines(index: number) {
    // Identify and remove polylines connected to the removed marker
    const connectedKeys = Array.from(polylines.keys()).filter(key => {
      const [startIndex, endIndex] = key.split('-').map(Number);
      return startIndex === index || endIndex === index;
    });
    
    connectedKeys.forEach(key => {
      const polyline = polylines.get(key);
      if (polyline) {
        if (map?.hasLayer(polyline)) {
          map.removeLayer(polyline);
        }
        polylines.delete(key);
      }
    });
  }

  function removePolyline(start: L.LatLng, end: L.LatLng) {
    const key = generatePolylineKey(start, end);
    const polylineToRemove = polylines.get(key);

    if (polylineToRemove) {
      if (map?.hasLayer(polylineToRemove)) {
        map.removeLayer(polylineToRemove);
      }
      polylines.delete(key);
    }
  }

  function addPolyline(start: L.LatLng, end: L.LatLng) {
    const key = generatePolylineKey(start, end);
    removePolyline(start, end); // Ensure no old polyline is left

    const latlngs: L.LatLngExpression[] = [start, end];
    const polyline = L.polyline(latlngs, { color: 'red' });
    map?.addLayer(polyline);

    polylines.set(key, polyline);
  }

  function generatePolylineKey(start: L.LatLng, end: L.LatLng): string {
    const startLatLng = [start.lat, start.lng].join(',');
    const endLatLng = [end.lat, end.lng].join(',');
    return [startLatLng, endLatLng].sort().join('-'); // Ensure consistent ordering
  }

  async function updateMap(event: Event, index: number) {
    let action = event.target as HTMLSelectElement;
    const lat = document.querySelector(`#lat-${index}`) as HTMLInputElement;
    const lon = document.querySelector(`#lon-${index}`) as HTMLInputElement;

    if (!action_types.includes(action.value)) {
        action = (event.target! as HTMLInputElement).parentElement!.parentElement!.querySelector('select')!;
    }

    // Remove old marker if it exists
    if (markers.has(index)) {
        map?.removeLayer(markers.get(index)!);
    }

    // Add new marker
    if (L && map && lat.value && lon.value) {
        let marker = L.marker([Number(lat.value), Number(lon.value)], { icon: icons[action_types.indexOf(action.value)] })
            .bindPopup(`${index} - ${action.value}`);
        map.addLayer(marker);
        marker.openPopup();
        markers.set(index, marker); // Update marker reference
    }

    // Remove old polylines connected to the current marker
    removeConnectedPolylines(index);

    // Add or update polyline connections based on updated markers
    updatePolylines();
  }

  function updatePolylines() {
    // Clear existing polylines before recalculating
    polylines.forEach(polyline => {
      if (map?.hasLayer(polyline)) {
        map.removeLayer(polyline);
      }
    });
    polylines.clear(); // Clear the map reference

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

    // Handle the connection from the first marker to the MAV location
    if (markerEntries.length > 0) {
        const [firstIndex, firstMarker] = markerEntries[0];
        if (get(mapStore)) {
            let prevMarkerLatLng = get(mavLocationStore)!;
            let currentMarkerLatLng = firstMarker.getLatLng();
            if (prevMarkerLatLng && currentMarkerLatLng) {
                addPolyline(prevMarkerLatLng, currentMarkerLatLng);
            }
        }
    }
  }
</script>

<div class="flightplan bg-[#1c1c1e] text-white p-4 rounded-lg space-x-4 items-center h-full overflow-auto">
  <div class="container block">
    <input type="text" class="text-md font-bold mb-2 ml-4 focus:outline-none" placeholder="Untitled Flight Plan"/>
    <div class="flex items-center gap-2 float-right text-sm">
      <button class="px-2 py-1 bg-[#55b377] text-white rounded-lg hover:bg-[#61cd89]" on:click={() => {}}>Start Flight</button>
      <button class="px-2 py-1 bg-[#da864e] text-white rounded-lg hover:bg-[#ff995e]" on:click={() => {}}>Pause Flight</button>
      <button class="px-2 py-1 bg-[#d94d7c] text-white rounded-lg hover:bg-[#ff5e78]" on:click={() => {}}>Stop Flight</button>
    </div>
    <div class="column h-[10vh]">
      <div class="overflow-auto">
        <hr>
        {#each actions as action, index}
          <div class="flex items-center action-container">
              <div class="form-checkbox">
                  <input type="checkbox" id="action-{index}" />
                  <label for="action-{index}">{index}</label>
              </div>
              <div class="separator"></div>
              <div class="form-input text-center">
                  <label for="action">Action Type</label>
                  <select class="mt-1" name="action" id="action-{index}" bind:value={selectedActions[index]} on:change={(event) => updateMap(event, index)}>
                  {#each action_types as action_type}
                      <option value="{action_type}">{action_type}</option>
                  {/each}
                  </select>
              </div>
              <div class="separator"></div>
              <div class="form-input text-center grid gap-2">
                  <input type="number" step="0.001" id="lat-{index}" placeholder="Latitude - eg. 33.749" on:change={(event) => updateMap(event, index)} />
                  <input type="number" step="0.001" id="lon-{index}" placeholder="Longitude - eg. -84.388" on:change={(event) => updateMap(event, index)} />
              </div>
              <div class="separator"></div>
              <div class="form-input text-center flex gap-2">
                  <label for="altitude">Altitude</label>
                  <select name="altitude" id="altitude" value="100">
                  <option value="100">100</option>
                  <option value="150">150</option>
                  <option value="200">200</option>
                  <option value="250">250</option>
                  <option value="300">300</option>
                  <option value="350">350</option>
                  </select> ft
              </div>
              <div class="separator"></div>
              <div class="form-input">
                  <input type="text" placeholder="Notes" />
              </div>
              <div class="separator"></div>
              <div class="form-input w-[fit-content] flex items-center gap-3">
                  <input type="checkbox" id="action-{index}-notify" />
                  <label for="action-{index}-notify" class="text-sm flex">Notify on complete?</label>
              </div>
              <div class="separator"></div>
              <button class="bg-[#2d2d2d] text-white rounded-lg px-3 py-2 text-sm" on:click={() => removeAction(index)}>
                  <i class="fas fa-trash-alt text-red-400"></i>
              </button>
          </div>
          <hr>
        {/each}
      </div>
      <div class="flex justify-center">
        <button class="bg-[#2d2d2d] text-white rounded-lg px-4 py-2 my-4" on:click={addAction}>
          <i class="fas fa-plus"></i>&nbsp;&nbsp;Add Action
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .column {
    flex: 1;
    padding: 0 1rem;
  }

  .separator {
    height: 4vh;
    background-color: #2d2d2d;
    margin: 0 1em;
    padding: 1px;
    border-radius: 0.5rem;
  }

  hr {
    border: 0;
    border-top: 1px solid #2d2d2d;
  }

  .form-checkbox {
    display: flex;
    align-items: center;
  }

  .form-checkbox input {
    display: none;
  }

  .form-checkbox:checked {
    background-color: #61cd89;
  }

  .form-input {
    padding: 0.5rem;
    font-size: 0.875rem;
  }

  input, select {
    border: none;
    border-radius: 0.5rem;
    padding-inline: 0.5em;
    padding-block: 0.25em;
    background-color: #2d2d2d;
    color: white;
  }

  input:focus, select:focus {
    border-color: #61cd89;
  }

  .form-input:focus {
    outline: none;
    border-color: #61cd89;
  }

  input[type="checkbox"] {
    appearance: none;
    width: 1rem;
    height: 1rem;
    border-radius: 0.25rem;
    background-color: #2d2d2d;
    cursor: pointer;
  }

  input[type="checkbox"]:checked {
    background-color: #61cd89;
  }
</style>
