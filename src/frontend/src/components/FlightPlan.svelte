<script lang="ts">
  import { onMount } from 'svelte';
  import { mapStore } from '../stores/mapStore';
  import { get } from 'svelte/store';
  
  let L: typeof import('leaflet');
  let actions: number[] = [1];
  let action_types = [
    'WAYPOINT', 'TAKEOFF', 'RETURN_TO_LAUNCH', 'ALTITUDE_TIME', 'DELAY',
    'GUIDED_ENABLE', 'LAND', 'LOITER_TIME', 'LOITER_TURNS', 'LOITER_UNLIM',
    'PAYLOAD_PLACE', 'SCRIPT_TIME', 'DO_SEND_SCRIPT_MESSAGE', 'DO_SET_CAM_TRIGG_DIST',
    'DO_SET_SERVO', 'DO_REPEAT_SERVO', 'DO_DIGICAM_CONFIGURE', 'DO_DIGICAM_CONTROL',
    'DO_MOUNT_CONFIGURE', 'DO_MOUNT_CONTROL', 'DO_SET_CAM_TRIGG_DIST', 'DO_FENCE_ENABLE',
    'CONDITION_DELAY', 'CONDITION_CHANGE_ALT', 'CONDITION_DISTANCE', 'CONDITION_YAW',
    'DO_WINCH', 'CONDITION_DELAY', 'CONDITION_DISTANCE', 'CONDITION_YAW', 'UNKNOWN'
  ];
  let selectedActions: string[] = Array(actions.length).fill('WAYPOINT');

  let map: L.Map | null = null;
  let markers: Map<number, L.Marker> = new Map(); // Map to keep track of markers

  mapStore.subscribe((value: L.Map | null) => {
    map = value;
  });

  onMount(async () => {
    const module = await import('leaflet');
    L = module;
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
  }

  async function updateMap(event: Event, index: number) {
    let action = event.target as HTMLSelectElement;
    const lat = document.querySelector(`#lat-${index}`) as HTMLInputElement;
    const lon = document.querySelector(`#lon-${index}`) as HTMLInputElement;

    if (!action_types.includes(action.value)) {
      action = (event.target! as HTMLInputElement).parentElement!.parentElement!.querySelector('select')!;
    }

    // Remove previous marker if it exists
    if (markers.has(index)) {
      map?.removeLayer(markers.get(index)!);
    }

    if (L && map && lat.value && lon.value) {
      map.flyTo([Number(lat.value), Number(lon.value)], 13);
      let marker = L.marker([Number(lat.value), Number(lon.value)])
          .bindPopup(`${index} - ${action.value}`);
      map.addLayer(marker);
      marker.openPopup();
      markers.set(index, marker); // Keep reference to the marker
    }
  }
</script>

<div class="flightplan bg-[#1c1c1e] text-white p-4 rounded-lg space-x-4 items-center h-full overflow-auto">
  <div class="container block">
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
