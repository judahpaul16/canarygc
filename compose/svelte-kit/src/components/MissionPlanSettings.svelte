<script lang="ts">
    import { mapStore} from "../stores/mapStore";
    import {
        missionPlanTitleStore,
        missionPlanActionsStore,
        missionCompleteStore,
        type MissionPlanActions
        } from "../stores/missionPlanStore";
    import Modal from "./Modal.svelte";
    import ManageMissionPlans from "./ManageMissionPlans.svelte";
    import {
        darkModeStore,
        primaryColorStore,
        secondaryColorStore,
        tertiaryColorStore
    } from '../stores/customizationStore';
    import { get } from "svelte/store";
    import { onMount } from "svelte";
    import Notification from "./Notification.svelte";

    let actions: MissionPlanActions = get(missionPlanActionsStore);
    let title: string = "";

    $: title = $missionPlanTitleStore
    $: actions = $missionPlanActionsStore;
    $: map = $mapStore;
    
    $: darkMode = $darkModeStore;
    $: primaryColor = $primaryColorStore;
    $: secondaryColor = $secondaryColorStore;
    $: tertiaryColor = $tertiaryColorStore;
    $: fontColor = darkMode ? "#ffffff" : "#000000";

    async function sendMavlinkCommand(command: string, params: string  = '', useCmdLong: string = 'false', useArduPilotMega: string = 'false') {
        const response = await fetch(`/api/mavlink/send_command`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'command': command,
                'params': params,
                'useCmdLong': useCmdLong,
                'useArduPilotMega': useArduPilotMega
            },
        });
        if (response.ok) {
            console.log(await response.text());
        } else {
            console.error(`Error: ${await response.text()}`);
        }
    }

    function toggleMissionPlans() {
        const modal = new ManageMissionPlans({
            target: document.body,
            props: {
                isModal: true,
                isOpen: true,
                onCancel: () => {
                    modal.$destroy();
                },
            },
        });
    }

    async function saveMissionPlan() {
        const modal = new Modal({
            target: document.body,
            props: {
                title: "Save & Load Mission Plan",
                content: "Are you sure you want to save and load this mission plan? This action will overwrite the currently loaded mission plan.",
                isOpen: true,
                confirmation: true,
                notification: false,
                onConfirm: async () => {
                    let title = get(missionPlanTitleStore);
                    if (title === "") title = "Untitled Mission Plan";
                    await handleSave(title, actions);
                },
                onCancel: () => {
                    modal.$destroy();
                },
            },
        });
    }

    async function handleLoad(title: string, actions: MissionPlanActions) {
        sendMavlinkCommand('DO_SET_MODE', `${[1, 4]}`, 'true'); // 4 is GUIDED: see CopterMode enum in /mavlink-mappings/dist/lib/ardupilotmega.ts

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
        try {
            let response = await fetch("/api/mavlink/load_mission", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "actions": JSON.stringify(actions),
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
        
    function duplicateTakeoffAndShift(actions: Record<string, any>): Record<string, any> {
        const newActions: Record<string, any> = {};
        
        // First, add the duplicated takeoff points
        newActions['0'] = { ...actions['1'] };
        newActions['1'] = { ...actions['1'] };
        
        // Then shift the remaining points up
        Object.keys(actions).forEach((key, index) => {
            if (key !== '0' && key !== '1') {
                newActions[(parseInt(key)).toString()] = { ...actions[key] };
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
                new Modal({
                    target: document.body,
                    props: {
                        title: "Error",
                        content: error.message,
                        isOpen: true,
                        confirmation: false,
                        notification: true,
                    },
                });
            });
            if (response) {
              let notification = new Notification({
                target: document.body,
                props: {
                    title: "Mission Plan Saved",
                    content: "The mission plan has been saved.",
                    type: "info",
                },
              });
              setTimeout(() => {
                  notification.$destroy();
              }, 3000);
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
            new Modal({
                target: document.body,
                props: {
                    title: "Error",
                    content: error.message,
                    isOpen: true,
                    confirmation: false,
                    notification: true,
                },
            });
        });
        if (response) {
            let notification = new Notification({
                target: document.body,
                props: {
                title: "Mission Plan Updated",
                content: "The mission plan has been updated.",
                type: "info",
                },
            });
            setTimeout(() => {
                notification.$destroy();
            }, 3000);
        }
    }

    async function importPlan() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = e.target?.result;
                const plan = JSON.parse(data as string);
                const title = file.name.replace(".json", "").replace(/_/g, " ");
                await handleSave(title, plan);
            };
            reader.readAsText(file);
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
        // @ts-ignore
        a.download = title.replace(/\s/g, "_") || "Untitled_Flight_Plan" + ".json";
        a.click();
        URL.revokeObjectURL(url);
    }

    async function removeAllActions(clearLoadedPlan: boolean = false) {
        actions = {};

        document.querySelectorAll(".action-container").forEach((el) => {
            el.remove();
        });

        document.querySelectorAll("#flight-plan-title").forEach((el) => {
            // @ts-ignore
            el.value = "";
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
        let modal = new Modal({
            target: document.body,
            props: {
                title: "Clear Mission Plan",
                content: "Are you sure you want to clear the current mission plan? This action will remove all actions from the map. Check the box to also clear the mission plan on the flight controller.",
                isOpen: true,
                confirmation: true,
                notification: false,
                inputs: [
                    {
                        type: "checkbox",
                        placeholder: "Clear on Flight Controller",
                        required: false,
                    },
                ],
                onConfirm: () => {
                    removeAllActions(modal.inputValues![0] === "true");
                    modal.$destroy();
                },
            },
        });
    }

    function setHomeLocation() {
        let modal = new Modal({
            target: document.body,
            props: {
                title: "Set Home Location",
                content: "Please enter the latitude and longitude for home. This is where the MAV will return in RTL mode.",
                isOpen: true,
                confirmation: true,
                notification: false,
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
                onConfirm: async () => {
                    let lat = Number((parseFloat(modal.inputValues![0]) * 1e7).toFixed(0));
                    let lon = Number((parseFloat(modal.inputValues![1]) * 1e7).toFixed(0));
                    let alt = Number(parseFloat(modal.inputValues![2]).toFixed(0));
                    let useCurrent = 0;
                    if (isNaN(lat) || isNaN(lon) || isNaN(alt)) {
                        useCurrent = 1;
                        lat = 0;
                        lon = 0;
                        alt = 0;
                    }
                    try {
                        let response = await fetch("/api/mavlink/send_command", {
                            method: "POST",
                            headers: {
                                "content-type": "application/json",
                                "command": "DO_SET_HOME",
                                "params": `${[useCurrent, 0, 0, 0, lat, lon, alt]}`
                            },
                        });
                        if (response.ok) {
                            let newModal = new Modal({
                                target: document.body,
                                props: {
                                    title: "Home Location Set",
                                    content: "The home location has been set successfully.",
                                    isOpen: true,
                                    confirmation: false,
                                    notification: true,
                                },
                            });
                            setTimeout(() => {
                                newModal.$destroy();
                            }, 3000);
                        } else {
                            new Modal({
                                target: document.body,
                                props: {
                                    title: "Error",
                                    content: "An error occurred while setting the home location.",
                                    isOpen: true,
                                    confirmation: false,
                                    notification: true,
                                },
                            });
                        }
                    } catch (error: any) {
                        new Modal({
                            target: document.body,
                            props: {
                                title: "Error",
                                content: error.message,
                                isOpen: true,
                                confirmation: false,
                                notification: true,
                            },
                        });
                    }
                    modal.$destroy();
                },
            },
        });
    }
</script>

<section
    class="flight-plan-settings rounded-2xl p-4 h-full"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
    <button on:click={setHomeLocation}>
        <i class="fas fa-home text-[#ffc64a]"></i>
        Set Home Location
    </button>
    <button on:click={toggleMissionPlans}>
        <i class="fas fa-globe text-[#5398e6]"></i>
        Manage Missions
    </button>
    <button on:click={saveMissionPlan}>
        <i class="fas fa-save text-[#61cd89]"></i>
        Save & Load Mission
    </button>
    <button on:click={confirmClear}>
        <i class="fas fa-trash-alt text-[#f87171]"></i>
        Clear Mission
    </button>
    <div id="import-export" class="flex items-center justify-center gap-2">
        <button on:click={importPlan}>
            <i class="fas fa-upload"></i>
            <span class="text-[8.5pt]">Import Mission</span>
        </button>
        <button on:click={exportMissionPlan}>
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
        border-radius: 0.5rem;
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
