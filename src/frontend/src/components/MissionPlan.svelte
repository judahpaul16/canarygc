<script lang="ts">
  import { onMount } from 'svelte';
  import { mapStore } from '../stores/mapStore';
  import { mavLocationStore } from '../stores/mavlinkStore';
  import { flightPlanTitleStore, flightPlanActionsStore } from '../stores/flightPlanStore';
  import { get } from 'svelte/store';
  import Modal from './Modal.svelte';

  export let title: string = '';
  let actions: {
      [key: number]: {
          type: string;
          lat: number;
          lon: number;
          altitude: number;
          notes: string;
          notify: boolean;
      };
  } = {};
  let action_types = [
    'WAYPOINT', 'SPLINE_WAYPOINT', 'TAKEOFF', 'RETURN_TO_LAUNCH', 'GUIDED_ENABLE', 'LAND',
    'LOITER_TIME', 'LOITER_TURNS', 'LOITER_UNLIM', 'PAYLOAD_PLACE', 'DO_WINCH', 'DO_SET_CAM_TRIGG_DIST',
    'DO_SET_SERVO', 'DO_REPEAT_SERVO', 'DO_DIGICAM_CONFIGURE', 'DO_DIGICAM_CONTROL', 'DO_FENCE_ENABLE',
    'DO_ENGINE_CONTROL', 'CONDITION_DELAY', 'CONDITION_CHANGE_ALT', 'CONDITION_DISTANCE', 'CONDITION_YAW'
  ];
  
  $: map = $mapStore;

  $: mavLocation = $mavLocationStore;

  $: actions = $flightPlanActionsStore;

  onMount(async () => {
    mapStore.subscribe((value: L.Map | null) => {
      map = value;
    });

    mavLocationStore.subscribe((value) => {
      mavLocation = value;
    });

    flightPlanTitleStore.subscribe((value) => {
      title = value;
    });

    flightPlanActionsStore.subscribe((value) => {
      actions = value;
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
    mavLocation = get(mavLocationStore)!;
    actions = get(flightPlanActionsStore);

    // Determine the next index
    const newIndex = Object.keys(actions).length + 1;

    // Add new action
    actions = { 
      ...actions, 
      [newIndex]: {
        type: 'WAYPOINT',
        lat: mavLocation.lat + 0.00225,
        lon: mavLocation.lng - 0.00225,
        altitude: 100,
        notes: '',
        notify: false,
      }
    };

    flightPlanActionsStore.set(actions);
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

    // Update the map with new action count
    reindexActions(); // Ensure this function handles reindexing correctly
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
    flightPlanActionsStore.set(actions);
  
    // Update UI to reflect new indexes
    updateActionUI();
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

  function updateActionType(event: Event) {
    const select = event.target as HTMLSelectElement;
    const index = Number(select.id.split('-')[1]);
    actions[index].type = select.value;
    flightPlanActionsStore.set(actions);
  }

  function updateLat(event: Event) {
    const input = event.target as HTMLInputElement;
    const index = Number(input.id.split('-')[1]);
    actions[index].lat = Number(input.value);
    flightPlanActionsStore.set(actions);
  }

  function updateLon(event: Event) {
    const input = event.target as HTMLInputElement;
    const index = Number(input.id.split('-')[1]);
    actions[index].lon = Number(input.value);
    flightPlanActionsStore.set(actions);
  }
</script>

<div class="flightplan bg-[#1c1c1e] text-white p-4 rounded-lg space-x-4 items-center h-full">
  <div class="container block">
    <input type="text" class="text-md font-bold mb-2 ml-4 focus:outline-none" placeholder="Untitled Mission Plan" id="flight-plan-title" bind:value={title} />
    <div class="flex items-center gap-2 float-right text-sm">
      <a href="https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html" target="_blank" class="text-[#61cd89] hover:underline mr-2">
        <i class="fas fa-question-circle"></i>
        How do I create a mission plan?
      </a>
      <button class="px-2 py-1 bg-[#588ae7] text-white rounded-lg hover:bg-[#6f9ff9]" on:click={() => {}}>
        <i class="fas fa-check"></i>
        <div class="tooltip">Validate Mission Plan</div>
      </button>
      <button class="px-2 py-1 bg-[#55b377] text-white rounded-lg hover:bg-[#61cd89]" on:click={() => {}}>
        <i class="fas fa-play"></i>
        <div class="tooltip">Start/Resume Flight</div>
      </button>
      <button class="px-2 py-1 bg-[#da864e] text-white rounded-lg hover:bg-[#ff995e]" on:click={() => {}}>
        <i class="fas fa-pause"></i>
        <div class="tooltip">Pause Flight (Loiter)</div>
      </button>
      <button class="px-2 py-1 bg-[#f87171] text-white rounded-lg hover:bg-[#ff7e7e]" on:click={() => {}}>
        <i class="fas fa-stop"></i>
        <div class="tooltip">Stop Flight (RTL)</div>
      </button>
    </div>
    <div class="column overflow-auto" id="flight-plan-actions">
      <div class="overflow-auto">
        <hr>
        {#key actions}
          {#each Object.keys(actions) as index}
            <div id="action-{index}" class="flex items-center action-container">
                <div class="form-checkbox">
                    <span>{index}</span>
                </div>
                <div class="separator"></div>
                <div class="form-input text-center">
                    <label for="action">Action Type</label>
                    <a href="https://ardupilot.org/copter/docs/mission-command-list.html" target="_blank" class="text-[#61cd89] ml-1" title="More Information">
                        <i class="fas fa-info-circle"></i>
                    </a>
                    <select class="mt-1" name="action" id="action-{index}-type" on:change={updateActionType} value={actions[Number(index)].type}>
                    {#each action_types as action_type}
                        <option value="{action_type}">{action_type}</option>
                    {/each}
                    </select>
                </div>
                <div class="separator"></div>
                <div class="form-input text-center grid gap-1">
                    <div class="flex justify-between items-center gap-3">
                      <span class="text-[8pt]">Lat</span>
                      <input type="number" step="0.0001" id="lat-{index}" placeholder="eg. 33.749" value={actions[Number(index)].lat} on:change={updateLat} />
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-[8pt]">Lon</span>
                      <input type="number" step="0.0001" id="lon-{index}" placeholder="eg. -84.388" value={actions[Number(index)].lon} on:change={updateLon} />
                    </div>
                </div>
                <div class="separator"></div>
                <div class="form-input text-center flex gap-2 justify-center items-center">
                    <label for="altitude">Altitude</label>
                    <input type="number" min="0" name="altitude" id="altitude-{index}" class="altitude" value={String(actions[Number(index)].altitude)}>
                    <span class="text-xs text-gray-400">m</span>
                </div>
                <div class="separator"></div>
                <div class="form-input flex items-center justify-center">
                    <textarea placeholder="Notes" value={actions[Number(index)].notes} />
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
  
  input[type='number'] {
    width: 100px;
    font-size: 9pt;
  }

  .altitude {
    width: 60px !important;
  }

  textarea {
    width: 120px;
    background-color: #2d2d2d;
    border-radius: 1em;
    padding: 0.5rem;
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

  #flight-plan-actions {
    max-height: 200px;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    .flightplan {
      overflow: hidden;
      overflow-y: auto;
    }

    #flight-plan-title {
      margin-inline: 0;
    }

    .float-right {
      display: block;
      margin-bottom: 1em;
    }
    a {
      font-size: small;
    }
    
    .container {
      display: inline-grid;
      align-items: center;
      justify-content: center;
    }
  }

  @media (max-width: 1320px) {
    #flight-plan-actions {
      max-height: 260px;
    }
  }
  @media (max-width: 1060px) {
    #flight-plan-actions {
      max-height: 270px;
    }
  }
</style>
