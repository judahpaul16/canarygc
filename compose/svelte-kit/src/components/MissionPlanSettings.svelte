<script lang="ts">
    import { mount, unmount } from 'svelte';

    import { mapStore} from "../stores/mapStore";
    import {
        missionPlanTitleStore,
        missionPlanActionsStore,
        missionCompleteStore,
        type MissionPlanActions
        } from "../stores/missionPlanStore";
    import ManageMissionPlans from "./ManageMissionPlans.svelte";
    import {
        darkModeStore,
        primaryColorStore,
        secondaryColorStore,
        tertiaryColorStore
    } from '../stores/customizationStore';
    import { get } from "svelte/store";
    import { showModal, notify } from '../lib/overlays';
    import { setFlightMode, sendMavlinkCommand } from '../lib/mavlink-client';
    import { optimizeMissionPath } from '../lib/path-planning';
    import { normalizeMission } from '../lib/mission-commands';
    import { parseMissionFile } from '../lib/mission-import';
    import { isPX4 } from '../lib/flight-modes';
    import { mavModelStore } from '../stores/mavlinkStore';
    import { airspaceZonesStore, obstaclesStore, safetyLimitsStore } from '../stores/safetyStore';
    import { refreshAirspace, refreshHazards, refreshBuildings } from '../lib/preflight';

    const SAVE_FEEDBACK_MS = 3000;
    const DEGREES_TO_E7 = 1e7;

    async function optimizePath() {
        const actions = get(missionPlanActionsStore);
        // Pull current hazards, buildings, and airspace for the mission area so
        // avoidance has data even if the overlays were never opened.
        const [, , buildings] = await Promise.all([
            refreshAirspace(actions),
            refreshHazards(actions),
            refreshBuildings(actions)
        ]);
        const limits = get(safetyLimitsStore);
        const result = optimizeMissionPath(
            actions,
            get(airspaceZonesStore),
            get(obstaclesStore),
            buildings,
            limits.maxAltitudeM
        );
        if (!result.changed) {
            notify({
                title: 'Path already clear',
                content: 'No leg crosses restricted airspace, an obstacle, or a building at its altitude.',
                duration: SAVE_FEEDBACK_MS
            });
            return;
        }
        missionPlanActionsStore.set(result.actions);
        const n = (count: number) => (count > 1 ? 's' : '');
        const parts: string[] = [];
        if (result.clearedLegs > 0) {
            parts.push(`added ${result.addedWaypoints} waypoint${n(result.addedWaypoints)} to route around ${result.clearedLegs} hazard${n(result.clearedLegs)}`);
        }
        if (result.raisedWaypoints > 0) {
            parts.push(`raised ${result.raisedWaypoints} waypoint${n(result.raisedWaypoints)} to clear obstacles or buildings`);
        }
        if (result.movedWaypoints > 0) {
            parts.push(`moved ${result.movedWaypoints} waypoint${n(result.movedWaypoints)} clear of restricted airspace`);
        }
        notify({
            title: 'Path adjusted for hazards',
            content: `Path ${parts.join(', ')}. Review the plan before flying.`,
            duration: SAVE_FEEDBACK_MS * 2
        });
    }

    let actions: MissionPlanActions = $derived($missionPlanActionsStore);
    let title: string = $derived($missionPlanTitleStore);
    let map = $derived($mapStore);

    let darkMode = $derived($darkModeStore);
    let primaryColor = $derived($primaryColorStore);
    let secondaryColor = $derived($secondaryColorStore);
    let tertiaryColor = $derived($tertiaryColorStore);
    let fontColor = $derived(darkMode ? "#ffffff" : "#000000");

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
        if (title === "") title = "Untitled Mission Plan";
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
            title: "Optimize path before saving?",
            content:
                "Optimize Path checks the route against airspace, obstacles, and buildings, and adjusts waypoints and heights to clear them. Saving also loads the plan, overwriting the one currently loaded.",
            confirmation: true,
            confirmLabel: "Optimize, then save",
            cancelLabel: "Save without optimizing",
            inputs: [{ type: 'checkbox', placeholder: "Don't show this again", required: false }],
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

    async function handleLoad(title: string, actions: MissionPlanActions) {
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
                title: "Mission adjusted for PX4",
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
                    title: "Error",
                    content: error.message,
                    notification: true,
                });
            });
            if (response) {
                notify({
                    title: "Mission Plan Saved",
                    content: "The mission plan has been saved.",
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
                title: "Mission Plan Updated",
                content: "The mission plan has been updated.",
                duration: SAVE_FEEDBACK_MS,
            });
        }
    }

    async function importPlan() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,.plan,.waypoints,.txt,.mission";
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const { title, actions: imported } = parseMissionFile(file.name, ev.target?.result as string);
                    await handleSave(title, imported);
                    notify({
                        title: "Mission Imported",
                        content: `Loaded ${Object.keys(imported).length} items from ${file.name}.`,
                        duration: SAVE_FEEDBACK_MS,
                    });
                } catch (err) {
                    showModal({
                        title: "Import Failed",
                        content: (err as Error).message,
                        notification: true,
                    });
                }
            };
            reader.readAsText(file);
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

    async function removeAllActions(clearLoadedPlan: boolean = false) {
        actions = {};

        document.querySelectorAll(".action-container").forEach((el) => {
            el.remove();
        });

        document.querySelectorAll("#flight-plan-title").forEach((el) => {
            (el as HTMLInputElement).value = "";
        });

        mapStore.set(map);
        missionPlanTitleStore.set("");
        missionPlanActionsStore.set(actions);

        if (clearLoadedPlan) {
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
        }
    }

    function confirmClear() {
        showModal({
            title: "Clear Mission Plan",
            content: "Are you sure you want to clear the current mission plan? This action will remove all actions from the map. Check the box to also clear the mission plan on the flight controller.",
            confirmation: true,
            inputs: [
                {
                    type: "checkbox",
                    placeholder: "Clear on Flight Controller",
                    required: false,
                },
            ],
            onConfirm: (values) => {
                removeAllActions(values[0] === "true");
            },
        });
    }

    function setHomeLocation() {
        showModal({
            title: "Set Home Location",
            content: "Please enter the latitude and longitude for home. This is where the MAV will return in RTL mode.",
            confirmation: true,
            inputs: [
                {
                    type: "number",
                    placeholder: "Latitude",
                    required: false,
                },
                {
                    type: "number",
                    placeholder: "Longitude",
                    required: false,
                },
                {
                    type: "number",
                    placeholder: "Altitude",
                    required: false,
                },
            ],
            onConfirm: async (values) => {
                let lat = Number((parseFloat(values[0]) * DEGREES_TO_E7).toFixed(0));
                let lon = Number((parseFloat(values[1]) * DEGREES_TO_E7).toFixed(0));
                let alt = Number(parseFloat(values[2]).toFixed(0));
                let useCurrent = 0;
                if (isNaN(lat) || isNaN(lon) || isNaN(alt)) {
                    useCurrent = 1;
                    lat = 0;
                    lon = 0;
                    alt = 0;
                }
                const ok = await sendMavlinkCommand("DO_SET_HOME", [useCurrent, 0, 0, 0, lat, lon, alt]);
                if (ok) {
                    notify({
                        title: "Home Location Set",
                        content: "The home location has been set successfully.",
                        duration: SAVE_FEEDBACK_MS,
                    });
                } else {
                    showModal({
                        title: "Error",
                        content: "An error occurred while setting the home location.",
                        notification: true,
                    });
                }
            },
        });
    }
</script>

<section
    class="flight-plan-settings rounded-2xl p-4 h-full"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
    <button onclick={setHomeLocation}>
        <i class="fas fa-home text-[#ffc64a]"></i>
        Set Home Location
    </button>
    <button onclick={toggleMissionPlans}>
        <i class="fas fa-globe text-[#5398e6]"></i>
        Manage Missions
    </button>
    <button onclick={optimizePath}>
        <i class="fas fa-wand-magic-sparkles text-[#c07bff]"></i>
        Optimize Path
    </button>
    <button onclick={saveMissionPlan}>
        <i class="fas fa-save text-[#61cd89]"></i>
        Save & Load Mission
    </button>
    <button onclick={confirmClear}>
        <i class="fas fa-trash-alt text-[#f87171]"></i>
        Clear Mission
    </button>
    <div id="import-export" class="flex items-center justify-center gap-2">
        <button onclick={importPlan}>
            <i class="fas fa-upload"></i>
            <span class="text-[8.5pt]">Import Mission</span>
        </button>
        <button onclick={exportMissionPlan}>
            <i class="fas fa-download"></i>
            <span class="text-[8.5pt]">Export Mission</span>
        </button>
    </div>
</section>

<style>
    .flight-plan-settings {
        display: flex;
        flex-direction: column;
        gap: 1em;
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
