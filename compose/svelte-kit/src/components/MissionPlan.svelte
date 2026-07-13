<script lang="ts">
  import { onMount } from 'svelte';
  import { mavLocationStore, mavModeStore, mavStateStore, mavlinkParamStore } from '../stores/mavlinkStore';
  import {
    missionPlanTitleStore,
    missionPlanActionsStore,
    missionCompleteStore,
    missionIndexStore,
    type MissionPlanActions
  } from '../stores/missionPlanStore';
  import { get } from 'svelte/store';
  import { showModal, notify } from '../lib/overlays';
  import { sendMavlinkCommand, setFlightMode, armDisarm, writeParameter, encodeParameterValue } from '../lib/mavlink-client';
  import { isAutoLabel, isGuidedLabel, isPX4 } from '../lib/flight-modes';
  import { ACTION_TYPES } from '../lib/mission-icons';
  import { preflightCheck } from '../lib/preflight';
  import { optimizePath, startSurveyCapture, startOrbitCapture } from '../lib/plan-actions';

  const GRIPPER_SERVO_CHANNEL = 9;
  const GRIPPER_OPEN_PWM_US = 1050;
  const GRIPPER_CLOSE_PWM_US = 1950;
  const GRIPPER_CYCLE_DELAY_MS = 500;
  const TAKEOFF_SETTLE_DELAY_MS = 5000;
  const DEFAULT_TAKEOFF_ALT_M = 10;
  const RTL_ALT_CM_PER_M = 100;

  interface Props {
    title?: string;
  }

  let { title = $bindable('') }: Props = $props();
  let actions: MissionPlanActions = $derived($missionPlanActionsStore);
  // Rows with any parameter set keep the inputs visible; the rest collapse to
  // a button so the common case stays compact.
  let paramsOpen: Record<number, boolean> = $state({});

  function hasParams(action: MissionPlanActions[number] | undefined): boolean {
    return [action?.param1, action?.param2, action?.param3, action?.param4].some(
      (v) => v !== null && v !== undefined && `${v}` !== ''
    );
  }
  let action_types = ACTION_TYPES;
  let mavLocation = $derived($mavLocationStore);
  let mavMode = $derived($mavModeStore);
  let systemState = $derived($mavStateStore);
  $effect(() => {
    title = $missionPlanTitleStore;
  });
  let missionLoaded = $derived($missionPlanTitleStore !== '');

  onMount(async () => {
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    function resizeInput() {
      input.style.width = `${input.scrollWidth}px`;
    }
    resizeInput();
      let width = Math.max(140, input.scrollWidth - 88);
      input.style.width = `${width}px`;
    input.addEventListener('input', resizeInput);
  });

  function stopMission() {
    showModal({
      title: 'Stop Mission',
      content: 'Are you sure you want to stop the flight?',
      confirmation: true,
      onConfirm: async () => {
        await setFlightMode('RTL');
        notify({
          title: 'Mission Stopped',
          content: 'The mission has been stopped.<br>Returning to launch.',
        });
      },
    });
  }

  function pauseMission() {
    showModal({
      title: 'Pause Mission',
      content: 'Are you sure you want to pause the flight?',
      confirmation: true,
      onConfirm: async () => {
        await setFlightMode('LOITER');
        notify({
          title: 'Mission Paused',
          content: 'The mission has been paused.',
        });
      },
    });
  }

  function startMission() {
    const rtlAltParam = get(mavlinkParamStore).RTL_ALT;
    const encodedValue = rtlAltParam
      ? encodeParameterValue(rtlAltParam.param_value, rtlAltParam.param_type)
      : DEFAULT_TAKEOFF_ALT_M * RTL_ALT_CM_PER_M;
    showModal({
      title: 'Start / Resume Mission',
      content: 'Are you sure you want to start the mission? Please specify RTL_ALT (Return to Launch Altitude) in METERS. Make sure to consider any potential obstacles between the RTL waypoint and the launch location.',
      confirmation: true,
      inputs: [
        {
          type: 'number',
          placeholder: `RTL_ALT: ${encodedValue / RTL_ALT_CM_PER_M} m`,
          required: true,
        }
      ],
      onConfirm: async (values) => {
        if (!(await preflightCheck(get(missionPlanActionsStore)))) return;
        missionIndexStore.set(1);
        missionCompleteStore.set(false);
        const params = get(mavlinkParamStore);
        if (!isPX4() && params.RTL_ALT) {
          await writeParameter('RTL_ALT', parseInt(values[0]) * RTL_ALT_CM_PER_M, params.RTL_ALT.param_type);
          if (params.RTL_CLIMB_MIN) await writeParameter('RTL_CLIMB_MIN', 0, params.RTL_CLIMB_MIN.param_type);
        }
        if (get(mavStateStore) === 'STANDBY') {
          await setFlightMode('GUIDED');
          await armDisarm(true);
          await sendMavlinkCommand('NAV_TAKEOFF', [0, 0, 0, NaN, NaN, NaN, DEFAULT_TAKEOFF_ALT_M], { cmdLong: true });
          await new Promise((resolve) => setTimeout(resolve, TAKEOFF_SETTLE_DELAY_MS));
        }
        await setFlightMode('AUTO');
        notify({
          title: 'Mission Started',
          content: 'The mission has been started.',
        });
      },
    });
  }

  function releasePayload() {
    showModal({
      title: 'Confirm Release Payload',
      content: 'Are you sure you want to release the payload?\nUse caution and ensure the drop zone is clear.',
      confirmation: true,
      onConfirm: async () => {
        if (!isGuidedLabel(mavMode)) await setFlightMode('GUIDED');
        await sendMavlinkCommand('DO_SET_SERVO', [GRIPPER_SERVO_CHANNEL, GRIPPER_OPEN_PWM_US]);
        await new Promise((resolve) => setTimeout(resolve, GRIPPER_CYCLE_DELAY_MS));
        await sendMavlinkCommand('DO_SET_SERVO', [GRIPPER_SERVO_CHANNEL, GRIPPER_CLOSE_PWM_US]);
      },
    });
  }

  function addAction() {
    mavLocation = get(mavLocationStore)!;
    actions = get(missionPlanActionsStore);

    // Determine the next index
    const newIndex = Object.keys(actions).length;

    let location = { lat: 0, lng: 0 };
    let type = 'NAV_WAYPOINT';
    if (newIndex === 0 || newIndex === 1) type = 'NAV_TAKEOFF';
    if (newIndex === 0 || newIndex === 1) location = mavLocation;
    else location = {
      lat: Object.values(actions)[newIndex - 1].lat,
      lng: Object.values(actions)[newIndex - 1].lon
    };

    // Add new action
    actions = { 
      ...actions, 
      [newIndex]: {
        type: type,
        lat: location.lat,
        lon: location.lng,
        alt: null,
        notes: '',
        param1: null,
        param2: null,
        param3: null,
        param4: null,
      }
    };

    missionPlanActionsStore.set(actions);
    if (newIndex === 0) addAction();
  }

  async function removeAction(id: string) {
    showModal({
      title: "Delete Action",
      content: "Are you sure you want to delete this action?",
      confirmation: true,
      onConfirm: () => {
        handleRemove(parseInt(id));
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
    if (select.value === 'DO_SET_SERVO') {
      actions[index].param1 = 9;
      actions[index].param2 = 1950;
      actions[index].param3 = null;
      actions[index].param4 = null;
    } else if (select.value === 'DO_REPEAT_SERVO') {
      actions[index].param1 = 9;
      actions[index].param2 = 1950;
      actions[index].param3 = 2;
      actions[index].param4 = 1;
    } else {
      actions[index].param1 = null;
      actions[index].param2 = null;
      actions[index].param3 = null;
      actions[index].param4 = null;
    }
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
  
</script>

<div
  class="elevated-surface missionPlan p-4 rounded-2xl space-x-4 items-center h-full"
>
  <div class="container">
    <div class="head">
    <input type="text" class="text-md font-bold ml-4 focus:outline-none" placeholder="Untitled Mission" id="mission-plan-title" bind:value={title} oninput={(event) => updateTitle(event)} />
    <div class="mission-btns flex items-center gap-2 text-sm">
      <a href="https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html" target="_blank" class="text-[#61cd89] hover:underline mr-2">
        <i class="fas fa-question-circle"></i>
        How do I create a mission plan?
      </a>
      <button class="px-2 py-1 bg-[#d9a21b] rounded-lg hover:bg-[#f5c518]" aria-label="Survey pattern" onclick={startSurveyCapture}>
        <i class="fas fa-vector-square"></i>
        <div class="tooltip">Survey Pattern</div>
      </button>
      <button class="px-2 py-1 bg-[#38bdf8] rounded-lg hover:bg-[#6fd1ff]" aria-label="Orbit pattern" onclick={startOrbitCapture}>
        <i class="fas fa-circle-notch"></i>
        <div class="tooltip">Orbit Pattern</div>
      </button>
      <button class="px-2 py-1 bg-[#a06be0] rounded-lg hover:bg-[#c07bff]" aria-label="Optimize path" onclick={optimizePath}>
        <i class="fas fa-wand-magic-sparkles"></i>
        <div class="tooltip">Optimize Path</div>
      </button>
      <span class="btn-divider"></span>
      <button class="px-2 py-1 bg-[#588ae7] rounded-lg hover:bg-[#6f9ff9]" onclick={() => {releasePayload()}}>
          <i class="fas fa-parachute-box"></i>
          <div class="tooltip">Release Payload</div>
      </button>
      {#if !isAutoLabel(mavMode) || systemState === 'STANDBY'}
        <button class="px-2 py-1 bg-[#55b377] rounded-lg hover:bg-[#61cd89]"
          disabled={isAutoLabel(mavMode) && systemState !== 'STANDBY' || !missionLoaded}
          onclick={() => {startMission()}}
        >
          <i class="fas fa-play"></i>
          <div class="tooltip">Start/Resume Mission</div>
        </button>
      {:else}
        <button class="px-2 py-1 bg-[#da864e] rounded-lg hover:bg-[#ff995e]"
          disabled={!isAutoLabel(mavMode) || !missionLoaded}
          onclick={() => {pauseMission()}}
        >
          <i class="fas fa-pause"></i>
          <div class="tooltip">Pause Mission (Loiter)</div>
        </button>
      {/if}
      <button class="px-2 py-1 bg-[#f87171] rounded-lg hover:bg-[#ff7e7e]"
          disabled={!isAutoLabel(mavMode) || !missionLoaded}
          onclick={() => {stopMission()}}
        >
        <i class="fas fa-stop"></i>
        <div class="tooltip">Stop Mission (RTL)</div>
      </button>
    </div>
    </div>
    <p class="hint">
      <i class="fas fa-circle-info"></i>
      Double-click the map to add a waypoint. Drag a marker to move it.
    </p>
    <div class="column overflow-auto" id="mission-plan-actions">
      <div class="overflow-auto">
        <hr>
        {#key actions}
          {#each Object.keys(actions) as index (index)}
            {#if Number(index) !== 0}
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
                      <select class="mt-1" name="action" id="action-{index}-type" onchange={updateActionType} value={actions[Number(index)].type}>
                      {#each action_types as action_type (action_type)}
                          <option value="{action_type}">{action_type}</option>
                      {/each}
                      </select>
                      <div class="text-center flex justify-center items-center gap-2 mt-2">
                        <label for="altitude" class="text-[9pt] mr-1">Altitude</label>
                        <input type="number" min="0" max="100" name="altitude" id="altitude-{index}" class="altitude" placeholder="0 = current alt" value={String(actions[Number(index)].alt ?? '')} onchange={updateAltitude}>
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
                      <input type="number" step="0.00001" id="lat-{index}" placeholder="eg. 33.749" value={actions[Number(index)].lat} onchange={updateLat} />
                      <span class="text-lg text-gray-400">°</span>
                    </div>
                    <div class="flex justify-between items-center gap-1">
                      <span class="text-[8pt] mr-2">Lon</span>
                      <input type="number" step="0.00001" id="lon-{index}" placeholder="eg. -84.388" value={actions[Number(index)].lon} onchange={updateLon} />
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
                      {#if !hasParams(actions[Number(index)]) && paramsOpen[Number(index)]}
                        <button
                          type="button"
                          class="params-cancel"
                          title="Hide the parameter inputs"
                          aria-label="Hide the parameter inputs"
                          onclick={() => (paramsOpen[Number(index)] = false)}
                        >
                          <i class="fas fa-xmark"></i> Cancel
                        </button>
                      {/if}
                    </h2>
                    {#if paramsOpen[Number(index)] || hasParams(actions[Number(index)])}
                      <div class="flex justify-between items-center gap-3">
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P1</span>
                          <input type="number" id="param1-{index}" placeholder="Empty" value={actions[Number(index)].param1} onchange={updateParam} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P2</span>
                          <input type="number" id="param2-{index}" placeholder="Empty" value={actions[Number(index)].param2} onchange={updateParam} />
                        </div>
                      </div>
                      <div class="flex justify-between items-center gap-3">
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P3</span>
                          <input type="number" id="param3-{index}" placeholder="Empty" value={actions[Number(index)].param3} onchange={updateParam} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P4</span>
                          <input type="number" id="param4-{index}" placeholder="Empty" value={actions[Number(index)].param4} onchange={updateParam} />
                        </div>
                      </div>
                    {:else}
                      <button type="button" class="params-toggle" onclick={() => (paramsOpen[Number(index)] = true)}>
                        <i class="fas fa-sliders"></i> Set parameters
                      </button>
                    {/if}
                  </div>
                  <div class="separator"></div>
                  <div class="form-input flex flex-col gap-1 items-center justify-center">
                      <h2 class="text-[9pt]">Additional Notes</h2>
                      <textarea placeholder="Notes" value={actions[Number(index)].notes} id="notes-{index}" onchange={updateNotes}></textarea>
                  </div>
                  <div class="separator"></div>
                  <button class="delete-action relative rounded-lg px-3 py-2 text-sm" onclick={() => removeAction(index)}>
                      <i class="fas fa-trash-alt text-red-400"></i>
                      <span class="tooltip">Delete Action</span>
                  </button>
              </div>
              <hr>
            {/if}
          {/each}
        {/key}
      </div>
      <div class="flex justify-center">
        <button class="add-action rounded-lg px-4 py-2 my-4" onclick={addAction}>
          <i class="fas fa-plus"></i>&nbsp;&nbsp;Add Action
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  /* The card is a fixed grid cell, so the header and hint take their natural
     height and the action list flexes to the remainder, scrolling internally
     instead of spilling past the card edge. */
  .container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .column {
    flex: 1;
    min-height: 0;
    padding: 0 1rem;
  }

  .hint {
    margin: 0.25rem 0 0.5rem 1rem;
    font-size: 8.5pt;
    opacity: 0.6;
  }

  .hint i {
    color: #61cd89;
    margin-right: 0.35rem;
  }

  .separator {
    height: 4vh;
    background-color: var(--secondaryColor);
    margin: 0 1em;
    padding: 1px;
    border-radius: var(--radius-control);
  }

  hr {
    border: 0;
    border-top: 1px solid var(--secondaryColor);
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
    border-radius: var(--radius-control);
    padding-inline: 0.5em;
    padding-block: 0.25em;
    background-color: var(--secondaryColor);
    color: var(--fontColor);
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
    background-color: var(--secondaryColor);
    border-radius: var(--radius-surface);
    padding: 0.5rem;
  }

  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    border-radius: var(--radius-control);
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

  .add-action {
    background-color: var(--secondaryColor);
  }

  .delete-action {
    background-color: var(--secondaryColor);
  }

  .delete-action:hover {
    background-color: #ff7e7e;
  }

  .delete-action:hover i {
    color: var(--fontColor);
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

  .mission-btns > button {
    color: white;
  }

  .mission-btns {
    flex-wrap: wrap;
  }

  .btn-divider {
    width: 1px;
    height: 1.25rem;
    background-color: rgb(from var(--fontColor) r g b / 0.25);
  }

  .missionPlan {
    color: var(--fontColor);
    background-color: var(--primaryColor);
  }

  .params-toggle {
    justify-self: center;
    margin: auto;
    padding: 0.4rem 0.9rem;
    font-size: 9pt;
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 1px solid var(--tertiaryColor);
    border-radius: var(--radius-control);
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .params-toggle:hover {
    border-color: #61cd89;
  }

  .params-cancel {
    margin-left: 0.5rem;
    padding: 0.1rem 0.5rem;
    font-size: 8pt;
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 1px solid var(--tertiaryColor);
    border-radius: var(--radius-control);
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .params-cancel:hover {
    border-color: #ff6b6b;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    .missionPlan {
      overflow: hidden;
      overflow-y: auto;
    }

    #mission-plan-title {
      margin-inline: 0;
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

</style>
