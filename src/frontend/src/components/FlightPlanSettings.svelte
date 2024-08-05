<script lang="ts">
    import { mapStore, mavLocationStore } from '../stores/mapStore';
    import { flightPlanStore } from '../stores/flightPlanStore';
    
    let actions: { [key: number]: {
        type: string;
        lat: number;
        lon: number;
        altitude: number;
        notes: string;
        notify: boolean;
    }} = {};

    flightPlanStore.subscribe((value) => {
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

    async function removeAllActions() {
        let L = await import('leaflet');
        let confirmed = confirm('Are you sure you want to clear the flight plan?');
        if (confirmed) {
            map!.eachLayer((layer) => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    map!.removeLayer(layer);
                }
            });
            const icon = L.icon({
                iconUrl: 'map/here.png',
                iconSize: [45, 45],
                iconAnchor: [23, 45],
                popupAnchor: [0, -45],
                shadowSize: [41, 41]
            });
            L.marker([mavLocation?.lat || 33.749, mavLocation?.lng || -84.388], {icon: icon}).addTo(map!);

            document.querySelectorAll('.action-container').forEach((el) => {
                el.remove();
            });

            mapStore.set(map);
            flightPlanStore.set({});
        }
    }
    
</script>

<section class="flight-plan-settings bg-[#1c1c1e] rounded-lg p-4 h-full text-white">
    <button>
        <i class="fas fa-save"></i>
        Save Flight Plan
    </button>
    <button on:click={removeAllActions}>
        <i class="fas fa-trash-alt"></i>
        Clear Flight Plan
    </button>
    <button>
        <i class="fas fa-upload"></i>
        Import Flight Plan
    </button>
    <button>
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

    button:first-of-type i {
        color: #61cd89;
    }

    button:nth-of-type(2) i {
        color: #f87171;
    }

</style>