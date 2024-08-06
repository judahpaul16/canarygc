<script lang="ts">
  import { onMount } from 'svelte';
  import { mapStore, mavLocationStore } from '../stores/mapStore';
  import { flightPlanStore } from '../stores/flightPlanStore';
  import { get } from 'svelte/store';

  let L: typeof import('leaflet');
  let actions: { [key: number]: {
    type: string;
    lat: number;
    lon: number;
    altitude: number;
    notes: string;
    notify: boolean;
  }} = {};
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
  let map: L.Map | null = null;
  let markers: Map<number, L.Marker> = new Map(); // Map to keep track of markers
  let polylines: Map<string, L.Polyline> = new Map(); // Map to keep track of polylines

  mapStore.subscribe((value: L.Map | null) => {
    map = value;
  });

  let remountKey = 0;

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

    updateMap(Object.keys(actions).length);
  });

  function remount() {
    setTimeout(() => {
      remountKey = 0;
      remountKey += 1;
    }, 300);
  }

  function addAction() {
    let mavLocation = get(mavLocationStore)!;
    actions = get(flightPlanStore);

    // Determine the next index
    const newIndex = Object.keys(actions).length + 1;

    // Add new action
    actions = { 
      ...actions, 
      [newIndex]: {
        type: 'WAYPOINT',
        lat: mavLocation.lat + 0.0049,
        lon: mavLocation.lng + 0.0184,
        altitude: 100,
        notes: '',
        notify: false,
      }
    };

    flightPlanStore.set(actions);
    
    setTimeout(() => {
      updateMap(Object.keys(actions).length);
    }, 100);
  }

  function removeAction(index: number) {
    // Remove the corresponding DOM element
    const actionElement = document.querySelector(`#action-${index}`) as HTMLSelectElement;
    if (actionElement) {
      actionElement.remove();
    }

    // Remove the specified action
    const { [index]: _, ...remainingActions } = actions;
    actions = remainingActions; // Trigger reactivity by creating a new object

    // Remove the marker from the map and the map reference
    if (markers.has(index)) {
      map?.removeLayer(markers.get(index)!); // Remove marker from the map
      markers.delete(index); // Remove marker from the markers reference
    }

    // Remove related polylines
    removeConnectedPolylines(index);

    // Update the map with new action count
    reindexActions(); // Ensure this function handles reindexing correctly
    flightPlanStore.set(actions);
    updateMap(Object.keys(actions).length);
    remount();
  }

  function reindexActions() {
    const newActions: { [key: number]: {
      type: string;
      lat: number;
      lon: number;
      altitude: number;
      notes: string;
      notify: boolean;
    } } = {};
    Object.values(actions).forEach((action, index) => {
      newActions[index + 1] = action;
    });
    actions = newActions;
  
    // Update UI to reflect new indexes
    updateActionUI();
    updateMarkersAndPolylines(true);
  }

  function updateActionUI() {
    const actionContainers = document.querySelectorAll('.action-container');
    actionContainers.forEach((container, index) => {
      container.id = `action-${index + 1}`;
      container.querySelector('span')!.textContent = `${index + 1}`;
      container.querySelectorAll('input').forEach((input) => {
        const id = input.id.split('-');
        id[1] = String(index + 1);
        input.id = id.join('-');
      });
      container.querySelectorAll('label').forEach((label) => {
        const id = label.htmlFor.split('-');
        id[1] = String(index + 1);
        label.htmlFor = id.join('-');
      });
      container.querySelectorAll('select').forEach((select) => {
        const id = select.id.split('-');
        id[1] = String(index + 1);
        select.id = id.join('-');
      });
      container.querySelectorAll('button').forEach((button) => {
        const id = button.id.split('-');
        id[1] = String(index + 1);
        button.id = id.join('-');
      });
    });
  }

  function removeConnectedPolylines(index: number) {
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

  async function updateMap(index: number) {
    flightPlanStore.subscribe((value) => {
      actions = value;
    });

    // Retrieve the action details using the index
    const action = actions[index];
    
    // Remove existing marker if it exists
    if (markers.has(index)) {
      map?.removeLayer(markers.get(index)!);
    }

    // Add new marker with updated info if map and action are valid
    if (L && map) {
      const { type, lat, lon } = action;
      const iconIndex = action_types.indexOf(type);
      
      if (!isNaN(lat) && !isNaN(lon) && iconIndex >= 0) {
        const marker = L.marker([lat, lon], { icon: icons[iconIndex] })
          .bindPopup(`${index} - ${type}`);
        map.addLayer(marker);
        marker.openPopup();
        markers.set(index, marker);
      }
    }

    // Remove polylines connected to this action and update all polylines
    removeConnectedPolylines(index);
    updateMarkersAndPolylines();
  }

  function updateMarkersAndPolylines(reindex: boolean = false) {
    if (reindex) {
      // Remove last marker
      const lastMarker = markers.get(Object.keys(actions).length + 1);
      if (lastMarker) {
        map?.removeLayer(lastMarker);
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
      if (map?.hasLayer(polyline)) {
        map.removeLayer(polyline);
      }
    });
    polylines.clear();

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

    if (markerEntries.length > 0) {
      const [firstIndex, firstMarker] = markerEntries[0];
      if (get(mapStore)) {
        let mavLocation = get(mavLocationStore)!;
        let currentMarkerLatLng = firstMarker.getLatLng();
        if (mavLocation && currentMarkerLatLng) {
            addPolyline(mavLocation, currentMarkerLatLng);
        }
      }
    }
  }
</script>

<div class="flightplan bg-[#1c1c1e] text-white p-4 rounded-lg space-x-4 items-center h-full">
  <div class="container block">
    <input type="text" class="text-md font-bold mb-2 ml-4 focus:outline-none" placeholder="Untitled Flight Plan"/>
    <div class="flex items-center gap-2 float-right text-sm">
      <a href="https://mavmanager.com/docs/how-to-create-a-flight-plan" target="_blank" class="text-[#61cd89] hover:underline mr-2">
        <i class="fas fa-question-circle"></i>
        How do I create a flight plan?
      </a>
      <button class="px-2 py-1 bg-[#55b377] text-white rounded-lg hover:bg-[#61cd89]" on:click={() => {}}>
        <i class="fas fa-play"></i>
        <div class="tooltip">Start/Resume Flight</div>
      </button>
      <button class="px-2 py-1 bg-[#da864e] text-white rounded-lg hover:bg-[#ff995e]" on:click={() => {}}>
        <i class="fas fa-pause"></i>
        <div class="tooltip">Pause Flight</div>
      </button>
      <button class="px-2 py-1 bg-[#d94d7c] text-white rounded-lg hover:bg-[#ff5e78]" on:click={() => {}}>
        <i class="fas fa-stop"></i>
        <div class="tooltip">Stop Flight</div>
      </button>
    </div>
    <div class="column h-[15vh] overflow-auto">
      <div class="overflow-auto">
        <hr>
        {#key remountKey}
          {#each Object.keys(actions) as index}
            <div id="action-{index}" class="flex items-center action-container">
                <div class="form-checkbox">
                    <span>{index}</span>
                </div>
                <div class="separator"></div>
                <div class="form-input text-center">
                    <label for="action">Action Type</label>
                    <select class="mt-1" name="action" id="action-{index}-type" bind:value={actions[Number(index)].type} on:change={() => updateMap(Number(index))}>
                    {#each action_types as action_type}
                        <option value="{action_type}">{action_type}</option>
                    {/each}
                    </select>
                </div>
                <div class="separator"></div>
                <div class="form-input text-center grid gap-2">
                    <input type="number" step="0.001" id="lat-{index}" placeholder="Latitude - eg. 33.749" on:change={() => updateMap(Number(index))} bind:value={actions[Number(index)].lat} />
                    <input type="number" step="0.001" id="lon-{index}" placeholder="Longitude - eg. -84.388" on:change={() => updateMap(Number(index))} bind:value={actions[Number(index)].lon} />
                </div>
                <div class="separator"></div>
                <div class="form-input text-center flex gap-2">
                    <label for="altitude">Altitude</label>
                    <select name="altitude" id="altitude-{index}" value={String(actions[Number(index)].altitude)}>
                    <option value=100>100</option>
                    <option value=150>150</option>
                    <option value=200>200</option>
                    <option value=250>250</option>
                    <option value=300>300</option>
                    <option value=350>350</option>
                    </select> ft
                </div>
                <div class="separator"></div>
                <div class="form-input">
                    <input type="text" placeholder="Notes" value={actions[Number(index)].notes} />
                </div>
                <div class="separator"></div>
                <div class="form-input w-[fit-content] flex items-center gap-3">
                    <input type="checkbox" id="action-{index}-notify" checked={actions[Number(index)].notify} />
                    <label for="action-{index}-notify" class="text-sm flex">Notify on complete?</label>
                </div>
                <div class="separator"></div>
                <button class="bg-[#2d2d2d] text-white rounded-lg px-3 py-2 text-sm" on:click={() => removeAction(Number(index))}>
                    <i class="fas fa-trash-alt text-red-400"></i>
                </button>
            </div>
            <hr>
          {/each}
        {/key}
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

  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 0.5rem;
    background-color: #000000dc;
    color: white;
    padding: 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
    z-index: 2;
  }

  button:hover .tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(-0.25em);
  }

  button {
    position: relative;
  }
</style>
