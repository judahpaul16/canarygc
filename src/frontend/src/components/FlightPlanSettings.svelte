<script lang="ts">
    import PocketBase from "pocketbase";
    import { onMount } from "svelte";
    import { mapStore, mavLocationStore, markersStore, polylinesStore } from "../stores/mapStore";
    import { flightPlanTitleStore, flightPlanActionsStore, type FlightPlanAction } from "../stores/flightPlanStore";
    import Modal from "./Modal.svelte";
    import ManageFlightPlans from "./ManageFlightPlans.svelte";

    const pb = new PocketBase("http://localhost:8090");

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

    flightPlanActionsStore.subscribe((value) => {
        actions = value;
    });

    let map: L.Map | null = null;
    let mavLocation: L.LatLng | null = null;

    mapStore.subscribe((value: L.Map | null) => {
        if (value) {
            map = value;
        }
    });

    mavLocationStore.subscribe((value) => {
        mavLocation = value;
    });

    function toggleFlightPlans() {
        const modal = new ManageFlightPlans({
            target: document.body,
            props: {
                isModal: true,
                isOpen: true,
            },
        });
    }

    async function saveFlightPlan() {
        let flightPlan = {
            // @ts-ignore
            title: document.querySelector("#flight-plan-title").value || "Untitled Flight Plan",
            actions: actions,
        };
        let response = await pb
            .collection("flight_plans")
            .create(flightPlan)
            .catch((error) => {
                const modal = new Modal({
                    target: document.body,
                    props: {
                        title: "Error Saving Flight Plan",
                        content: error.message,
                        isOpen: true,
                        confirmation: false,
                        notification: true,
                    },
                });
            });
        if (response) {
            const modal = new Modal({
                target: document.body,
                props: {
                    title: "Flight Plan Saved",
                    content: "The flight plan has been saved successfully.",
                    isOpen: true,
                    confirmation: false,
                    notification: true,
                },
            });
        }
    }

    function handleSave(title: string, plan: FlightPlanAction) {
        flightPlanTitleStore.set(title);
        flightPlanActionsStore.set(plan);
        let flightPlan = {
            title: title,
            actions: plan,
        };
        pb.collection("flight_plans").create(flightPlan);
        const modal = new Modal({
            target: document.body,
            props: {
                title: "Flight Plan Imported",
                content: "The flight plan has been imported successfully.",
                isOpen: true,
                confirmation: false,
                notification: true,
            },
        });
        
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

    async function exportFlightPlan() {
        flightPlanActionsStore.subscribe((value) => {
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

    async function removeAllActions() {
        let L = await import("leaflet");
        map!.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                map!.removeLayer(layer);
            }
        });
        const icon = L.icon({
            iconUrl: "map/here.png",
            iconSize: [45, 45],
            iconAnchor: [23, 45],
            popupAnchor: [0, -45],
            shadowSize: [41, 41],
        });
        L.marker([mavLocation?.lat || 33.749, mavLocation?.lng || -84.388], {
            icon: icon,
        }).addTo(map!);

        document.querySelectorAll(".action-container").forEach((el) => {
            el.remove();
        });

        document.querySelectorAll("#flight-plan-title").forEach((el) => {
            // @ts-ignore
            el.value = "";
        });

        mapStore.set(map);
        flightPlanTitleStore.set("");
        flightPlanActionsStore.set({});
        markersStore.set(new Map());
        polylinesStore.set(new Map());
    }

    function confirmClear() {
        const modal = new Modal({
            target: document.body,
            props: {
                title: "Clear Flight Plan",
                content: "Are you sure you want to clear the flight plan?",
                isOpen: true,
                confirmation: true,
                notification: false,
                onConfirm: removeAllActions,
            },
        });
    }
</script>

<section
    class="flight-plan-settings bg-[#1c1c1e] rounded-lg p-4 h-full text-white"
>
    <button on:click={toggleFlightPlans}>
        <i class="fas fa-tasks bg-[#5898e2]"></i>
        Manage Flight Plans
    </button>
    <button on:click={saveFlightPlan}>
        <i class="fas fa-save"></i>
        Save Flight Plan
    </button>
    <button on:click={confirmClear}>
        <i class="fas fa-trash-alt"></i>
        Clear Flight Plan
    </button>
    <button on:click={importPlan}>
        <i class="fas fa-upload"></i>
        Import Flight Plan
    </button>
    <button on:click={exportFlightPlan}>
        <i class="fas fa-download"></i>
        Export Flight Plan
    </button>
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

    button:nth-of-type(2) i {
        color: #61cd89;
    }

    button:nth-of-type(3) i {
        color: #f87171;
    }
</style>
