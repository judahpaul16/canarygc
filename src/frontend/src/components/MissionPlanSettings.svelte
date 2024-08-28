<script lang="ts">
    import PocketBase from "pocketbase";
    import { mapStore, markersStore, polylinesStore } from "../stores/mapStore";
    import { mavLocationStore } from '../stores/mavlinkStore';
    import { missionPlanTitleStore, missionPlanActionsStore, type MissionPlanActions } from "../stores/missionPlanStore";
    import Modal from "./Modal.svelte";
    import ManageMissionPlans from "./ManageMissionPlans.svelte";

    const pb = new PocketBase("http://localhost:8090");

    let actions: MissionPlanActions = {};

    let markers: Map<number, L.Marker> = new Map(); // Map to keep track of markers
    let polylines: Map<string, L.Polyline> = new Map(); // Map to keep track of polylines

    $: actions = $missionPlanActionsStore;

    $: map = $mapStore;

    $: mavLocation = $mavLocationStore;

    function toggleMissionPlans() {
        const modal = new ManageMissionPlans({
            target: document.body,
            props: {
                isModal: true,
                isOpen: true,
            },
        });
    }

    async function loadMissionPlan() {
        const modal = new Modal({
            target: document.body,
            props: {
                title: "Load Mission Plan",
                content: "Are you sure you want to load this mission plan? This action will overwrite the currently loaded mission plan.",
                isOpen: true,
                confirmation: true,
                notification: false,
                onConfirm: async () => {
                    // @ts-ignore
                    let title = document.querySelector("#flight-plan-title").value || "Untitled Mission Plan",
                    plan = actions;
                    await handleLoad(title, plan);
                },
                onCancel: () => {
                    modal.$destroy();
                },
            },
        });
    }

    async function saveMissionPlan() {
        // @ts-ignore
        let title = document.querySelector("#flight-plan-title").value || "Untitled Mission Plan",
        plan = actions;
        handleSave(title, plan);
    }

    async function handleLoad(title: string, actions: MissionPlanActions) {
        missionPlanTitleStore.set(title);
        missionPlanActionsStore.set(actions);
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
        
    async function handleSave(title: string, plan: MissionPlanActions) {
        let missionPlan = {
            title: title,
            actions: plan,
        };
        let response = await pb.collection("mission_plans").create(missionPlan).catch((error) => {
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
            let modal = new Modal({
                target: document.body,
                props: {
                    title: "Mission Plan Saved",
                    content: "The mission plan has been saved successfully.",
                    isOpen: true,
                    confirmation: false,
                    notification: true,
                },
            });
            setTimeout(() => {
                modal.$destroy();
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
        missionPlanActionsStore.subscribe((value) => {
            actions = value;
        });
        
        const blob = new Blob([JSON.stringify(actions)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // @ts-ignore
        a.download = document.querySelector("#flight-plan-title").value.replace(/\s/g, "_") || "Untitled_Flight_Plan" + ".json";
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
                let response = await fetch("/api/mavlink/clear_missions", {
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
                content: "Are you sure you want to clear the current mission plan? This action will remove all actions from the map. Check the box to also clear the currently loaded mission plan.",
                isOpen: true,
                confirmation: true,
                notification: false,
                inputs: [
                    {
                        type: "checkbox",
                        placeholder: "Clear Loaded Mission Plan",
                    },
                ],
                onConfirm: () => {
                    removeAllActions(modal.inputValue === "true");
                    modal.$destroy();
                },
            },
        });
    }
</script>

<section
    class="flight-plan-settings bg-[#1c1c1e] rounded-lg p-4 h-full text-white"
>
    <button on:click={toggleMissionPlans}>
        <i class="fas fa-globe text-[#5398e6]"></i>
        Manage Mission Plans
    </button>
    <button on:click={loadMissionPlan}>
        <i class="fas fa-cloud-arrow-up text-[#53c3f0]"></i>
        Load Mission Plan
    </button>
    <button on:click={saveMissionPlan}>
        <i class="fas fa-save text-[#61cd89]"></i>
        Save Mission Plan
    </button>
    <button on:click={confirmClear}>
        <i class="fas fa-trash-alt text-[#f87171]"></i>
        Clear Mission Plan
    </button>
    <div id="import-export" class="flex items-center justify-center gap-2">
        <button on:click={importPlan}>
            <i class="fas fa-upload"></i>
            <span class="text-[8.5pt]">Import</span>
        </button>
        <button on:click={exportMissionPlan}>
            <i class="fas fa-download"></i>
            <span class="text-[8.5pt]">Export</span>
        </button>
    </div>
</section>

<style>
    .flight-plan-settings {
        display: flex;
        flex-direction: column;
        gap: 1em;
    }

    button {
        display: flex;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background-color: #2d2d2d;
        border: none;
        border-radius: 0.5rem;
        color: white;
        font-size: calc(0.3rem + 0.5vw);
        cursor: pointer;
        align-items: center;
        justify-content: center;
    }

    button:hover {
        background-color: #3d3d3d;
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
            }
        }
    }
</style>
