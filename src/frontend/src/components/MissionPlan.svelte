<script lang="ts">
  import { onMount } from 'svelte';
  import { mavLocationStore, mavModeStore, mavStateStore } from '../stores/mavlinkStore';
  import {
    missionPlanTitleStore,
    missionPlanActionsStore,
    missionCompleteStore,
    missionIndexStore,
    type MissionPlanActions
  } from '../stores/missionPlanStore';
  import Modal from './Modal.svelte';
  import { get } from 'svelte/store';

  export let title: string = '';
  let actions: MissionPlanActions = {};
  let action_types = [
    'NAV_WAYPOINT', 'NAV_SPLINE_WAYPOINT', 'NAV_TAKEOFF', 'NAV_RETURN_TO_LAUNCH', 'NAV_GUIDED_ENABLE', 'NAV_LAND',
    'NAV_LOITER_TIME', 'NAV_LOITER_TURNS', 'NAV_LOITER_UNLIM', 'NAV_PAYLOAD_PLACE', 'DO_WINCH', 'DO_SET_CAM_TRIGG_DIST',
    'DO_SET_SERVO', 'DO_REPEAT_SERVO', 'DO_DIGICAM_CONFIGURE', 'DO_DIGICAM_CONTROL', 'DO_FENCE_ENABLE',
    'DO_ENGINE_CONTROL', 'CONDITION_DELAY', 'CONDITION_CHANGE_ALT', 'CONDITION_DISTANCE', 'CONDITION_YAW'
  ];
  
  $: mavLocation = $mavLocationStore;
  $: mavMode = $mavModeStore;
  $: systemState = $mavStateStore;
  $: title = $missionPlanTitleStore;
  $: actions = $missionPlanActionsStore;

  onMount(async () => {
    mavLocationStore.subscribe((value) => {
      mavLocation = value;
    });

    mavModeStore.subscribe((value) => {
      mavMode = value;
    });

    missionPlanTitleStore.subscribe((value) => {
      title = value;
    });

    missionPlanActionsStore.subscribe((value) => {
      actions = value;
    });

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    function resizeInput() {
      input.style.width = `${input.scrollWidth}px`;
    }
    resizeInput();
      let width = Math.max(140, input.scrollWidth - 88);
      input.style.width = `${width}px`;
    input.addEventListener('input', resizeInput);
  });

  async function sendMavlinkCommand(command: string, params: string  = '', useArduPilotMega: string = 'false') {
    const response = await fetch(`/api/mavlink/send_command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'command': command,
        'params': params,
        'useArduPilotMega': useArduPilotMega
      },
    });
    if (response.ok) {
      console.log(await response.text());
    } else {
      console.error(`Error: ${await response.text()}`);
    }
  }
  
  function stopMission() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Stop Mission',
        content: 'Are you sure you want to stop the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 6]}`); // 6 is RTL: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Mission Stopped',
              content: 'The flight has been stopped.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
        },
      }
    });
  }

  function pauseMission() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Pause Mission',
        content: 'Are you sure you want to pause the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 16]}`); // 16 is POSHOLD: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Mission Paused',
              content: 'The flight has been paused.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
        },
      }
    });
  }

  function resumeMission() {
    let modal = new Modal({
      target: document.body,
      props: {
        title: 'Resume Mission',
        content: 'Are you sure you want to resume the flight?',
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          missionIndexStore.set(1);
          missionCompleteStore.set(false);
          if (get(mavStateStore) === 'STANDBY') {
            await sendMavlinkCommand('DO_SET_MODE' , `${[1, 4]}`); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
            await sendMavlinkCommand('COMPONENT_ARM_DISARM', `${[1, 0]}`); // param2: 21196 bypasses pre-arm checks
            await sendMavlinkCommand('NAV_TAKEOFF', `${[0, 0, 0, 0, 0, 0, 10]}`);
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          }
          await sendMavlinkCommand('DO_SET_MODE' , `${[1, 3]}`); // 3 is AUTO Mode: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts
          modal.$destroy();
          const newModal = new Modal({
            target: document.body,
            props: {
              title: 'Mission Started',
              content: 'The mission has been started successfully.',
              isOpen: true,
              confirmation: false,
              notification: true,
            }
          });
          setTimeout(() => newModal.$destroy(), 3000);
        },
      }
    });
  }

  function addAction() {
    mavLocation = get(mavLocationStore)!;
    actions = get(missionPlanActionsStore);

    // Determine the next index
    const newIndex = Object.keys(actions).length;

    let type = 'NAV_WAYPOINT';
    if (newIndex === 0) type = 'NAV_TAKEOFF';

    // Add new action
    actions = { 
      ...actions, 
      [newIndex]: {
        type: type,
        lat: mavLocation.lat,
        lon: mavLocation.lng,
        alt: null,
        notes: '',
        param1: null,
        param2: null,
        param3: null,
        param4: null,
      }
    };

    missionPlanActionsStore.set(actions);
  }

  async function removeAction(id: string) {
    const modal = new Modal({
      target: document.body,
      props: {
        title: "Delete Action",
        content: "Are you sure you want to delete this action?",
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: () => {
          handleRemove(parseInt(id));
          modal.$destroy();
        },
        onCancel: () => {
          modal.$destroy();
        },
      },
    });
  }

  function handleRemove(index: number) {
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
    const newActions: MissionPlanActions = {};
    Object.values(actions).forEach((action, index) => {
      newActions[index] = action;
    });
    actions = newActions;
    missionPlanActionsStore.set(actions);
  
    // Update UI to reflect new indexes
    updateActionUI();
  }

  function updateActionUI() {
    const actionContainers = document.querySelectorAll('.action-container');
    actionContainers.forEach((container, index) => {
      container.id = `action-${index}`;
      container.querySelector('span')!.textContent = `${index}`;
      container.querySelectorAll('input').forEach((input) => {
        const id = input.id.split('-');
        id[1] = String(index);
        input.id = id.join('-');
      });
      container.querySelectorAll('label').forEach((label) => {
        const id = label.htmlFor.split('-');
        id[1] = String(index);
        label.htmlFor = id.join('-');
      });
      container.querySelectorAll('select').forEach((select) => {
        const id = select.id.split('-');
        id[1] = String(index);
        select.id = id.join('-');
      });
      container.querySelectorAll('button').forEach((button) => {
        const id = button.id.split('-');
        id[1] = String(index);
        button.id = id.join('-');
      });
    });
  }

  function updateTitle(event: Event) {
    const input = event.target as HTMLInputElement;
    title = input.value;
    missionPlanTitleStore.set(title);
  }

  function updateActionType(event: Event) {
    const select = event.target as HTMLSelectElement;
    const index = Number(select.id.split('-')[1]);
    actions[index].type = select.value;
    missionPlanActionsStore.set(actions);
  }

  function updateLat(event: Event) {
    const input = event.target as HTMLInputElement;
    const index = Number(input.id.split('-')[1]);
    actions[index].lat = Number(input.value);
    missionPlanActionsStore.set(actions);
  }

  function updateLon(event: Event) {
    const input = event.target as HTMLInputElement;
    const index = Number(input.id.split('-')[1]);
    actions[index].lon = Number(input.value);
    missionPlanActionsStore.set(actions);
  }

  function updateAltitude(event: Event) {
    const input = event.target as HTMLInputElement;
    const index = Number(input.id.split('-')[1]);
    actions[index].alt = Number(input.value);
    missionPlanActionsStore.set(actions);
  }

  function updateNotes(event: Event) {
    const input = event.target as HTMLInputElement;
    const index = Number(input.id.split('-')[1]);
    actions[index].notes = input.value;
    missionPlanActionsStore.set(actions);
  }

  function updateParam(event: Event) {
    const input = event.target as HTMLInputElement;
    const index = Number(input.id.split('-')[1]);
    actions[index][`${input.id.split('-')[0]}`] = Number(input.value);
    missionPlanActionsStore.set(actions);
  }
  
  function checkMode(target: string, mode: string) {
    return target.includes(mode);
  }
</script>

<div class="missionPlan bg-[#1c1c1e] text-white p-4 rounded-lg space-x-4 items-center h-full">
  <div class="container block">
    <input type="text" class="text-md font-bold mb-2 ml-4 focus:outline-none" placeholder="Untitled Mission" id="flight-plan-title" bind:value={title} on:input={(event) => updateTitle(event)} />
    <div class="flex items-center gap-2 float-right text-sm">
      <a href="https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html" target="_blank" class="text-[#61cd89] hover:underline mr-2">
        <i class="fas fa-question-circle"></i>
        How do I create a mission plan?
      </a>
      <button class="px-2 py-1 bg-[#588ae7] text-white rounded-lg hover:bg-[#6f9ff9]" on:click={() => {}}>
          <i class="fas fa-check"></i>
          <div class="tooltip">Validate Mission Plan</div>
      </button>
      {#if !checkMode('AUTO', mavMode) || systemState === 'STANDBY'}
        <button class="px-2 py-1 bg-[#55b377] text-white rounded-lg hover:bg-[#61cd89]"
          disabled={checkMode('AUTO', mavMode) && systemState !== 'STANDBY'} on:click={() => {resumeMission()}}>
              <i class="fas fa-play"></i>
              <div class="tooltip">Start/Resume Mission</div>
        </button>
      {:else}
        <button class="px-2 py-1 bg-[#da864e] text-white rounded-lg hover:bg-[#ff995e]"
          disabled={!checkMode('AUTO', mavMode)} on:click={() => {pauseMission()}}>
              <i class="fas fa-pause"></i>
              <div class="tooltip">Pause Mission (Loiter)</div>
        </button>
      {/if}
      <button class="px-2 py-1 bg-[#f87171] text-white rounded-lg hover:bg-[#ff7e7e]"
          disabled={!checkMode('AUTO', mavMode)} on:click={() => {stopMission()}}>
        <i class="fas fa-stop"></i>
        <div class="tooltip">Stop Mission (RTL)</div>
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
                    <label for="action" class="text-[9pt]">Action Type</label>
                    <a href="https://ardupilot.org/copter/docs/mission-command-list.html" target="_blank" class="text-[#61cd89] ml-1" title="More Information">
                        <i class="fas fa-info-circle text-[9pt]"></i>
                    </a>
                    <select class="mt-1" name="action" id="action-{index}-type" on:change={updateActionType} value={actions[Number(index)].type}>
                    {#each action_types as action_type}
                        <option value="{action_type}">{action_type}</option>
                    {/each}
                    </select>
                    <div class="text-center flex justify-center items-center gap-2 mt-2">
                      <label for="altitude" class="text-[9pt] mr-1">Altitude</label>
                      <input type="number" min="0" name="altitude" id="altitude-{index}" class="altitude" placeholder="0: current alt" value={String(actions[Number(index)].alt ?? '')} on:change={updateAltitude}>
                      <span class="text-xs text-gray-400">m</span>
                    </div>
                </div>
                <div class="separator"></div>
                <div class="form-input text-center grid gap-1">
                  <h2 class="text-[9pt]">
                    Coordinates
                    <a href="https://www.latlong.net/" target="_blank" class="text-[#61cd89] ml-1" title="Get Coordinates">
                      <i class="fas fa-info-circle"></i>
                    </a>
                  </h2>
                  <div class="flex justify-between items-center gap-1">
                    <span class="text-[8pt] mr-2">Lat</span>
                    <input type="number" step="0.0001" id="lat-{index}" placeholder="eg. 33.749" value={actions[Number(index)].lat} on:change={updateLat} />
                    <span class="text-lg text-gray-400">°</span>
                  </div>
                  <div class="flex justify-between items-center gap-1">
                    <span class="text-[8pt] mr-2">Lon</span>
                    <input type="number" step="0.0001" id="lon-{index}" placeholder="eg. -84.388" value={actions[Number(index)].lon} on:change={updateLon} />
                    <span class="text-lg text-gray-400">°</span>
                  </div>
                </div>
                <div class="separator"></div>
                <div class="form-input text-center grid gap-1">
                  <h2 class="text-[9pt] mb-1">
                    Parameters
                    <a href="https://mavlink.io/en/messages/common.html#mav_commands" target="_blank" class="text-[#61cd89] ml-1" title="More Information">
                      <i class="fas fa-info-circle"></i>
                    </a>
                  </h2>
                  <div class="flex justify-between items-center gap-3">
                    <div class="flex justify-between items-center gap-3">
                      <span class="text-[8pt]">P1</span>
                      <input type="number" id="param1-{index}" placeholder="Empty" value={actions[Number(index)].param1} on:change={updateParam} />
                    </div>
                    <div class="flex justify-between items-center gap-3">
                      <span class="text-[8pt]">P2</span>
                      <input type="number" id="param2-{index}" placeholder="Empty" value={actions[Number(index)].param2} on:change={updateParam} />
                    </div>
                  </div>
                  <div class="flex justify-between items-center gap-3">
                    <div class="flex justify-between items-center gap-3">
                      <span class="text-[8pt]">P3</span>
                      <input type="number" id="param3-{index}" placeholder="Empty" value={actions[Number(index)].param3} on:change={updateParam} />
                    </div>
                    <div class="flex justify-between items-center gap-3">
                      <span class="text-[8pt]">P4</span>
                      <input type="number" id="param4-{index}" placeholder="Empty" value={actions[Number(index)].param4} on:change={updateParam} />
                    </div>
                  </div>
                </div>
                <div class="separator"></div>
                <div class="form-input flex flex-col gap-1 items-center justify-center">
                    <h2 class="text-[9pt]">Additional Notes</h2>
                    <textarea placeholder="Notes" value={actions[Number(index)].notes} id="notes-{index}" on:change={updateNotes}></textarea>
                </div>
                <div class="separator"></div>
                <button class="delete-action relative bg-[#2d2d2d] text-white rounded-lg px-3 py-2 text-sm" on:click={() => removeAction(index)}>
                    <i class="fas fa-trash-alt text-red-400"></i>
                    <span class="tooltip">Delete Action</span>
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

  input[type='number'] {
    width: 100px;
    font-size: 9pt;
  }

  .altitude {
    width: 100px !important;
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

  .delete-action .tooltip {
    bottom: 0;
    left: 0;
    margin-bottom: 0;
  }

  .delete-action:hover .tooltip {
    transform: translateX(-108%);
  }

  button {
    position: relative;
  }
  
  button:disabled, button:disabled:hover {
    filter: brightness(0.5);
    cursor: not-allowed;
  }

  #flight-plan-actions {
    max-height: 200px;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    .missionPlan {
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
