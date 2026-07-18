<script lang="ts">
  import { onMount } from 'svelte';
  import {
    mavLocationStore,
    mavModeStore,
    mavStateStore,
    mavArmedStateStore,
    fcProtocolStore,
    fcFirmwareStore
  } from '../stores/mavlinkStore';
  import {
    missionPlanTitleStore,
    missionPlanActionsStore,
    type MissionPlanActions
  } from '../stores/missionPlanStore';
  import { get } from 'svelte/store';
  import { showModal, notify } from '../lib/overlays';
  import { sendMavlinkCommand, setFlightMode } from '../lib/mavlink-client';
  import { isAutoLabel, isGuidedLabel } from '../lib/flight-modes';
  import { startMissionWithConfirm } from '../lib/start-mission';
  import { takeoffWithConfirm, landWithConfirm } from '../lib/takeoff-land';
  import { ACTION_TYPES } from '../lib/mission-icons';
  import {
    startGuidanceWithConfirm,
    stopGuidance,
    startInavMissionWithConfirm,
    stopInavMission
  } from '../lib/guidance-session';
  import { optimizePath, startSurveyCapture, startOrbitCapture, startCorridorCapture, startSarCapture, startStructureScanCapture } from '../lib/plan-actions';
  import { m } from '$lib/paraglide/messages';

  const GRIPPER_SERVO_CHANNEL = 9;
  const GRIPPER_OPEN_PWM_US = 1050;
  const GRIPPER_CLOSE_PWM_US = 1950;
  const GRIPPER_CYCLE_DELAY_MS = 500;

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
  let isArmed = $derived($mavArmedStateStore);
  $effect(() => {
    title = $missionPlanTitleStore;
  });
  let missionLoaded = $derived($missionPlanTitleStore !== '');
  // INAV runs its own mission over MSP the same as a MAVLink autopilot; Betaflight
  // has no waypoint engine and flies by companion guidance from the station.
  let fcIsMsp = $derived($fcProtocolStore === 'msp');
  let fcIsInav = $derived($fcProtocolStore === 'msp' && $fcFirmwareStore === 'INAV');
  function flyPlan() {
    if (fcIsInav) startInavMissionWithConfirm();
    else if (fcIsMsp) startGuidanceWithConfirm();
    else startMissionWithConfirm();
  }
  function onPause() {
    if (fcIsInav) stopInavMission();
    else if (fcIsMsp) stopGuidance();
    else pauseMission();
  }
  function endFlight() {
    if (fcIsInav) stopInavMission();
    else if (fcIsMsp) stopGuidance();
    else stopMission();
  }

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
      title: m.mp_stop_title(),
      content: m.mp_stop_confirm(),
      confirmation: true,
      onConfirm: async () => {
        await setFlightMode('RTL');
        notify({
          title: m.mp_stopped_title(),
          content: m.mp_stopped_body(),
        });
      },
    });
  }

  function pauseMission() {
    showModal({
      title: m.mp_pause_title(),
      content: m.mp_pause_confirm(),
      confirmation: true,
      onConfirm: async () => {
        await setFlightMode('LOITER');
        notify({
          title: m.mp_paused_title(),
          content: m.mp_paused_body(),
        });
      },
    });
  }

  function releasePayload() {
    showModal({
      title: m.mp_release_title(),
      content: m.mp_release_confirm(),
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
      title: m.mp_delete_action(),
      content: m.mp_delete_confirm(),
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
    <input type="text" class="text-md font-bold ml-4 focus:outline-none" placeholder={m.mp_untitled()} id="mission-plan-title" bind:value={title} oninput={(event) => updateTitle(event)} />
    <div class="mission-btns flex items-center gap-2 text-sm">
      <a href="https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html" target="_blank" class="text-[#61cd89] hover:underline mr-2">
        <i class="fas fa-question-circle"></i>
        {m.mp_how_to()}
      </a>
      <button class="px-2 py-1 bg-[#d9a21b] rounded-lg hover:bg-[#f5c518]" aria-label={m.mp_survey_pattern()} onclick={startSurveyCapture}>
        <i class="fas fa-vector-square"></i>
        <div class="tooltip">{m.mp_survey_pattern()}</div>
      </button>
      <button class="px-2 py-1 bg-[#38bdf8] rounded-lg hover:bg-[#6fd1ff]" aria-label={m.mp_orbit_pattern()} onclick={startOrbitCapture}>
        <i class="fas fa-circle-notch"></i>
        <div class="tooltip">{m.mp_orbit_pattern()}</div>
      </button>
      <button class="px-2 py-1 bg-[#2dd4bf] rounded-lg hover:bg-[#5ee7d5]" aria-label={m.mp_corridor_pattern()} onclick={startCorridorCapture}>
        <i class="fas fa-road"></i>
        <div class="tooltip">{m.mp_corridor_pattern()}</div>
      </button>
      <button class="px-2 py-1 bg-[#fb923c] rounded-lg hover:bg-[#fdb974]" aria-label={m.mp_search_pattern()} onclick={startSarCapture}>
        <i class="fas fa-magnifying-glass-location"></i>
        <div class="tooltip">{m.mp_search_pattern()}</div>
      </button>
      <button class="px-2 py-1 bg-[#f472b6] rounded-lg hover:bg-[#f9a8d4]" aria-label={m.mp_structure_scan()} onclick={startStructureScanCapture}>
        <i class="fas fa-building"></i>
        <div class="tooltip">{m.mp_structure_scan()}</div>
      </button>
      <button class="px-2 py-1 bg-[#a06be0] rounded-lg hover:bg-[#c07bff]" aria-label={m.mp_optimize_path()} onclick={optimizePath}>
        <i class="fas fa-wand-magic-sparkles"></i>
        <div class="tooltip">{m.mp_optimize_path()}</div>
      </button>
      <span class="btn-divider"></span>
      <button class="px-2 py-1 bg-[#588ae7] rounded-lg hover:bg-[#6f9ff9]" onclick={() => {releasePayload()}}>
          <i class="fas fa-parachute-box"></i>
          <div class="tooltip">{m.mp_release_payload()}</div>
      </button>
      {#if systemState === 'STANDBY' || !isArmed}
        <button class="px-2 py-1 bg-[#6366f1] rounded-lg hover:bg-[#818cf8]"
          disabled={isAutoLabel(mavMode) && systemState !== 'STANDBY'}
          onclick={() => {takeoffWithConfirm()}}
        >
          <i class="fas fa-plane-departure"></i>
          <div class="tooltip">{m.mp_initiate_takeoff()}</div>
        </button>
      {:else}
        <button class="px-2 py-1 bg-[#6366f1] rounded-lg hover:bg-[#818cf8]"
          disabled={isAutoLabel(mavMode) || mavMode.includes('LAND')}
          onclick={() => {landWithConfirm()}}
        >
          <i class="fas fa-plane-arrival"></i>
          <div class="tooltip">{m.mp_initiate_landing()}</div>
        </button>
      {/if}
      {#if !isAutoLabel(mavMode) || systemState === 'STANDBY'}
        <button class="px-2 py-1 bg-[#55b377] rounded-lg hover:bg-[#61cd89]"
          disabled={(isAutoLabel(mavMode) && systemState !== 'STANDBY') || (!missionLoaded && !fcIsMsp)}
          onclick={() => {flyPlan()}}
        >
          <i class="fas fa-play"></i>
          <div class="tooltip">{m.mp_start_resume()}</div>
        </button>
      {:else}
        <button class="px-2 py-1 bg-[#da864e] rounded-lg hover:bg-[#ff995e]"
          disabled={!isAutoLabel(mavMode) && !fcIsMsp}
          onclick={() => {onPause()}}
        >
          <i class="fas fa-pause"></i>
          <div class="tooltip">{m.mp_pause_loiter()}</div>
        </button>
      {/if}
      <button class="px-2 py-1 bg-[#f87171] rounded-lg hover:bg-[#ff7e7e]"
          disabled={(!isAutoLabel(mavMode) || !missionLoaded) && !fcIsMsp}
          onclick={() => {endFlight()}}
        >
        <i class="fas fa-stop"></i>
        <div class="tooltip">{m.mp_stop_rtl()}</div>
      </button>
    </div>
    </div>
    <p class="hint">
      <i class="fas fa-circle-info"></i>
      {m.mp_hint()}
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
                      <label for="action" class="text-[9pt]">{m.mp_action_type()}</label>
                      <a href="https://ardupilot.org/copter/docs/mission-command-list.html" target="_blank" class="text-[#61cd89] ml-1" title={m.common_more_info()}>
                          <i class="fas fa-info-circle text-[9pt]"></i>
                      </a>
                      <select class="mt-1" name="action" id="action-{index}-type" onchange={updateActionType} value={actions[Number(index)].type}>
                      {#each action_types as action_type (action_type)}
                          <option value="{action_type}">{action_type}</option>
                      {/each}
                      </select>
                      <div class="text-center flex justify-center items-center gap-2 mt-2">
                        <label for="altitude" class="text-[9pt] mr-1">{m.mp_altitude()}</label>
                        <input type="number" min="0" max="100" name="altitude" id="altitude-{index}" class="altitude" placeholder={m.mp_alt_placeholder()} value={String(actions[Number(index)].alt ?? '')} onchange={updateAltitude}>
                        <span class="text-xs text-gray-400">m</span>
                      </div>
                  </div>
                  <div class="separator"></div>
                  <div class="form-input text-center grid gap-1">
                    <h2 class="text-[9pt]">
                      {m.mp_coordinates()}
                      <a href="https://www.latlong.net/" target="_blank" class="text-[#61cd89] ml-1" title={m.mp_get_coords()}>
                        <i class="fas fa-info-circle"></i>
                      </a>
                    </h2>
                    <div class="flex justify-between items-center gap-1">
                      <span class="text-[8pt] mr-2">{m.mp_lat()}</span>
                      <input type="number" step="0.00001" id="lat-{index}" placeholder={m.mp_lat_placeholder()} value={actions[Number(index)].lat} onchange={updateLat} />
                      <span class="text-lg text-gray-400">°</span>
                    </div>
                    <div class="flex justify-between items-center gap-1">
                      <span class="text-[8pt] mr-2">{m.mp_lon()}</span>
                      <input type="number" step="0.00001" id="lon-{index}" placeholder={m.mp_lon_placeholder()} value={actions[Number(index)].lon} onchange={updateLon} />
                      <span class="text-lg text-gray-400">°</span>
                    </div>
                  </div>
                  <div class="separator"></div>
                  <div class="form-input text-center grid gap-1">
                    <h2 class="text-[9pt] mb-1">
                      {m.mp_parameters()}
                      <a href="https://mavlink.io/en/messages/common.html#mav_commands" target="_blank" class="text-[#61cd89] ml-1" title={m.common_more_info()}>
                        <i class="fas fa-info-circle"></i>
                      </a>
                      {#if !hasParams(actions[Number(index)]) && paramsOpen[Number(index)]}
                        <button
                          type="button"
                          class="params-cancel"
                          title={m.mp_hide_params()}
                          aria-label={m.mp_hide_params()}
                          onclick={() => (paramsOpen[Number(index)] = false)}
                        >
                          <i class="fas fa-xmark"></i> {m.common_cancel()}
                        </button>
                      {/if}
                    </h2>
                    {#if paramsOpen[Number(index)] || hasParams(actions[Number(index)])}
                      <div class="flex justify-between items-center gap-3">
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P1</span>
                          <input type="number" id="param1-{index}" placeholder={m.mp_empty()} value={actions[Number(index)].param1} onchange={updateParam} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P2</span>
                          <input type="number" id="param2-{index}" placeholder={m.mp_empty()} value={actions[Number(index)].param2} onchange={updateParam} />
                        </div>
                      </div>
                      <div class="flex justify-between items-center gap-3">
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P3</span>
                          <input type="number" id="param3-{index}" placeholder={m.mp_empty()} value={actions[Number(index)].param3} onchange={updateParam} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                          <span class="text-[8pt]">P4</span>
                          <input type="number" id="param4-{index}" placeholder={m.mp_empty()} value={actions[Number(index)].param4} onchange={updateParam} />
                        </div>
                      </div>
                    {:else}
                      <button type="button" class="params-toggle" onclick={() => (paramsOpen[Number(index)] = true)}>
                        <i class="fas fa-sliders"></i> {m.mp_set_params()}
                      </button>
                    {/if}
                  </div>
                  <div class="separator"></div>
                  <div class="form-input flex flex-col gap-1 items-center justify-center">
                      <h2 class="text-[9pt]">{m.mp_additional_notes()}</h2>
                      <textarea placeholder={m.mp_notes()} value={actions[Number(index)].notes} id="notes-{index}" onchange={updateNotes}></textarea>
                  </div>
                  <div class="separator"></div>
                  <button class="delete-action relative rounded-lg px-3 py-2 text-sm" onclick={() => removeAction(index)}>
                      <i class="fas fa-trash-alt text-red-400"></i>
                      <span class="tooltip">{m.mp_delete_action()}</span>
                  </button>
              </div>
              <hr>
            {/if}
          {/each}
        {/key}
      </div>
      <div class="flex justify-center">
        <button class="add-action rounded-lg px-4 py-2 my-4" onclick={addAction}>
          <i class="fas fa-plus"></i>&nbsp;&nbsp;{m.mp_add_action()}
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

  /* Mobile Styles: the card hugs its content while the action list caps
     itself and scrolls internally, so the hint and Add Action stay visible. */
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
      height: auto;
    }

    .column {
      max-height: 45vh;
      overflow-y: auto;
    }

    .btn-divider {
      display: none;
    }
  }

</style>
