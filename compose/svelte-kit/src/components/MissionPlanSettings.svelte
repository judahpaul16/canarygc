<script lang="ts">
    import { mount, unmount } from 'svelte';

    import {
        missionPlanTitleStore,
        missionPlanActionsStore,
        missionCompleteStore,
        type MissionPlanActions
        } from "../stores/missionPlanStore";
    import ManageMissionPlans from "./ManageMissionPlans.svelte";
    import { get } from "svelte/store";
    import { showModal, notify } from '../lib/overlays';
    import { setFlightMode } from '../lib/mavlink-client';
    import { openVehicleLocationModal } from '../lib/vehicle-location';
    import { optimizePath, confirmClear } from '../lib/plan-actions';
    import { normalizeMission } from '../lib/mission-commands';
    import { readMissionFile } from '../lib/mission-import';
    import { isPX4 } from '../lib/flight-modes';
    import { mavModelStore, fcProtocolStore } from '../stores/mavlinkStore';
    import { m } from '$lib/paraglide/messages';

    const SAVE_FEEDBACK_MS = 3000;

    let actions: MissionPlanActions = $derived($missionPlanActionsStore);
    let title: string = $derived($missionPlanTitleStore);
    function toggleMissionPlans() {
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            unmount(instance);
        };
        const instance = mount(ManageMissionPlans, {
            target: document.body,
            props: {
                isModal: true,
                isOpen: true,
                onCancel: close,
            },
        });
    }

    const SKIP_OPTIMIZE_PROMPT_KEY = 'skipOptimizePrompt';

    async function commitMissionPlan() {
        let title = get(missionPlanTitleStore);
        if (title === "") title = m.mps_untitled_plan();
        await handleSave(title, actions);
    }

    function rememberSkip(values: string[]) {
        if (values[0] === 'true') localStorage.setItem(SKIP_OPTIMIZE_PROMPT_KEY, 'true');
    }

    async function saveMissionPlan() {
        if (localStorage.getItem(SKIP_OPTIMIZE_PROMPT_KEY) === 'true') {
            await commitMissionPlan();
            return;
        }
        showModal({
            title: m.mps_optimize_title(),
            content: m.mps_optimize_body(),
            confirmation: true,
            confirmLabel: m.mps_optimize_save(),
            cancelLabel: m.mps_save_without(),
            inputs: [{ type: 'checkbox', placeholder: m.mps_dont_show(), required: false }],
            onConfirm: async (values) => {
                rememberSkip(values);
                await optimizePath();
                await commitMissionPlan();
            },
            onCancel: (values) => {
                rememberSkip(values);
                commitMissionPlan();
            },
        });
    }

    // Uploads the plan to an INAV flight controller over MSP. INAV flies
    // waypoint missions natively; Betaflight has no waypoint navigation, so its
    // plan stays in the planner and is not pushed to the board.
    async function loadOverMsp(title: string, actions: MissionPlanActions) {
        missionPlanTitleStore.set(title);
        missionPlanActionsStore.set(actions);
        missionCompleteStore.set(false);

        if (get(mavModelStore) !== 'INAV') {
            notify({
                title: m.mps_saved_title(),
                content: m.mps_saved_body(),
                duration: SAVE_FEEDBACK_MS,
            });
            return;
        }

        const items = Object.keys(actions)
            .map(Number)
            .sort((a, b) => a - b)
            .map((i) => ({ type: actions[i].type, lat: actions[i].lat, lon: actions[i].lon, alt: actions[i].alt }));
        try {
            const response = await fetch('/api/msp/load_mission', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(items),
            });
            const data = await response.json();
            if (response.ok) {
                notify({ title: m.mps_uploaded_title(), content: data.message, duration: SAVE_FEEDBACK_MS });
            } else {
                showModal({
                    title: m.mps_upload_failed_title(),
                    content: data.message ?? data.error ?? m.mps_upload_rejected(),
                    notification: true,
                });
            }
        } catch (error) {
            showModal({ title: m.mps_upload_failed_title(), content: (error as Error).message, notification: true });
        }
    }

    async function handleLoad(title: string, actions: MissionPlanActions) {
        if (get(fcProtocolStore) === 'msp') {
            await loadOverMsp(title, actions);
            return;
        }
        setFlightMode('GUIDED');

        // Clear the current mission plan
        try {
            let response = await fetch("/api/mavlink/clear_mission", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
            });
            if (response.ok) {
                console.log(await response.text());
            } else {
                console.error(`Error: ${await response.text()}`);
            }
        } catch (error) {
            console.error("Error:", error);
        }

        // Unload all mission plans first
        await fetch("/api/mission/unload", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
        });

        // Load the new mission plan
        await fetch("/api/mission/load", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "title": title,
            },
        });

        missionPlanTitleStore.set(title);
        missionPlanActionsStore.set(actions);
        missionCompleteStore.set(false);

        const { items, warnings } = normalizeMission(actions, isPX4(get(mavModelStore)));
        if (warnings.length > 0) {
            notify({
                title: m.mps_px4_adjusted_title(),
                content: warnings.join("<br>"),
                duration: SAVE_FEEDBACK_MS * 2,
            });
        }

        try {
            let response = await fetch("/api/mavlink/load_mission", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "actions": JSON.stringify(items),
                },
            });
            if (response.ok) {
                console.log(await response.text());
            } else {
                console.error(`Error: ${await response.text()}`);
            }
        } catch (error) {
            console.error("Error:", error);
        }
    }

    function duplicateTakeoffAndShift(actions: MissionPlanActions): MissionPlanActions {
        const newActions: MissionPlanActions = {};

        // First, add the duplicated takeoff points
        newActions[0] = { ...actions[1] };
        newActions[1] = { ...actions[1] };

        // Then shift the remaining points up
        Object.keys(actions).forEach((key) => {
            if (key !== '0' && key !== '1') {
                newActions[parseInt(key)] = { ...actions[parseInt(key)] };
            }
        });

        return newActions;
    }

    async function handleSave(title: string, plan: MissionPlanActions) {
        plan = duplicateTakeoffAndShift(plan);
        handleLoad(title, plan);

        let missionExists = false;
        let response = await fetch("/api/mission/checkExists", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "title": title,
            },
        });
        let responseData = await response.json();
        console.log(responseData);
        if (responseData.length > 0) missionExists = true;

        if (missionExists) {
            await handleUpdate(title, plan);
        } else {
            let missionPlan = {
                title: title,
                actions: plan,
                isLoaded: 1,
            };
            let response = await fetch("/api/mission/save", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "title": missionPlan.title,
                    "actions": JSON.stringify(missionPlan.actions),
                },
            }).catch((error) => {
                showModal({
                    title: m.common_error(),
                    content: error.message,
                    notification: true,
                });
            });
            if (response) {
                notify({
                    title: m.mps_plan_saved_title(),
                    content: m.mps_plan_saved_body(),
                    duration: SAVE_FEEDBACK_MS,
                });
            }
        }
    }

    async function handleUpdate(title: string, plan: MissionPlanActions) {
        let missionPlan = {
            title: title,
            actions: plan,
            isLoaded: 1,
        };
        let response = await fetch("/api/mission/update", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "title": missionPlan.title,
                "actions": JSON.stringify(missionPlan.actions),
            },
        }).catch((error) => {
            showModal({
                title: "Error",
                content: error.message,
                notification: true,
            });
        });
        if (response) {
            notify({
                title: m.mps_plan_updated_title(),
                content: m.mps_plan_updated_body(),
                duration: SAVE_FEEDBACK_MS,
            });
        }
    }

    async function importPlan() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,.plan,.waypoints,.txt,.mission,.kml,.kmz,.csv";
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const { title, actions: imported } = await readMissionFile(file);
                await handleSave(title, imported);
                notify({
                    title: m.mps_imported_title(),
                    content: m.mps_imported_body({ count: Object.keys(imported).length, file: file.name }),
                    duration: SAVE_FEEDBACK_MS,
                });
            } catch (err) {
                showModal({
                    title: m.mps_import_failed_title(),
                    content: (err as Error).message,
                    notification: true,
                });
            }
        };
        input.click();
    }

    async function exportMissionPlan() {
        const blob = new Blob([JSON.stringify(actions)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(title || "Untitled_Flight_Plan").replace(/\s/g, "_")}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

</script>

<section
    class="flight-plan-settings rounded-2xl p-4 h-full"
>
    <button onclick={openVehicleLocationModal}>
        <i class="fas fa-home text-[#ffc64a]"></i>
        {m.vl_modal_title()}
    </button>
    <button onclick={toggleMissionPlans}>
        <i class="fas fa-globe text-[#5398e6]"></i>
        {m.mps_manage_missions()}
    </button>
    <button onclick={saveMissionPlan}>
        <i class="fas fa-save text-[#61cd89]"></i>
        {m.mps_save_load()}
    </button>
    <button onclick={confirmClear}>
        <i class="fas fa-trash-alt text-[#f87171]"></i>
        {m.mps_clear_mission()}
    </button>
    <div id="import-export" class="flex items-center justify-center gap-2">
        <button onclick={importPlan}>
            <i class="fas fa-upload"></i>
            <span class="text-[8.5pt]">{m.mps_import_mission()}</span>
        </button>
        <button onclick={exportMissionPlan}>
            <i class="fas fa-download"></i>
            <span class="text-[8.5pt]">{m.mps_export_mission()}</span>
        </button>
    </div>
</section>

<style>
    /* Scrolls its own buttons at short viewports instead of overflowing the
       page grid, which would flip the page scrollbar and shift the map rect. */
    .flight-plan-settings {
        display: flex;
        flex-direction: column;
        gap: 1em;
        min-height: 0;
        overflow-y: auto;
        color: var(--fontColor);
        background-color: var(--primaryColor);
    }

    button {
        display: flex;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background-color: var(--secondaryColor);
        border: none;
        border-radius: var(--radius-control);
        color: var(--fontColor);
        font-size: 9pt;
        cursor: pointer;
        align-items: center;
        justify-content: center;
    }

    button:hover {
        background-color: var(--tertiaryColor);
    }

    /* Mobile Styles */
    @media (max-width: 990px) {
        .flight-plan-settings {
            overflow: auto;
        }
        button {
            font-size: 1rem;
        }
        #import-export {
            flex-direction: row;
        }
    }
    @media (max-width: 1300px) {
        .flight-plan-settings {
            max-height: 330px;
            overflow: auto;
        }
    }
    @media (max-width: 1500px) {
        @media (min-width: 990px) {
            #import-export {
                flex-direction: column;
                gap: 1em;
            }
            #import-export > button {
                width: 100%;
            }
        }
    }
</style>
