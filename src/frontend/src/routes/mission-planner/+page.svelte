<script lang="ts">
    import { onMount } from 'svelte';
    import Map from '../../components/Map.svelte';
    import Weather from '../../components/Weather.svelte';
    import Compass from '../../components/Compass.svelte';
    import MissionPlan from '../../components/MissionPlan.svelte';
    import MissionPlanSettings from '../../components/MissionPlanSettings.svelte';
    import { mavLocationStore } from '../../stores/mavlinkStore';
    import { primaryColorStore, secondaryColorStore, tertiaryColorStore } from '../../stores/customizationStore';
  
    $: mavLocation = $mavLocationStore
    $: primaryColor = $primaryColorStore;
    $: secondaryColor = $secondaryColorStore;
    $: tertiaryColor = $tertiaryColorStore;
  
    onMount(() => {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 1000);
    });
  </script>
  
  <sveltekit:head>
    <title>MAV Manager GCS - Dashboard</title>
  </sveltekit:head>

  <div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full grid grid-cols-12 grid-rows-7 gap-4 p-5 rounded-[30px] rounded-l-none overflow-auto max-h-[90vh]"
       style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor};"
    >
      <div class="map col-span-10 row-span-4 p-2 rounded-2xl">
        <Map {mavLocation} />
      </div>
      <div class="weather col-span-2 row-span-2">
        <Weather {mavLocation} />
      </div>
      <div class="compass col-span-2 row-span-2">
        <Compass {mavLocation} />
      </div>
      <div class="flight-plan col-span-10 row-span-2">
        <MissionPlan />
      </div>
      <div class="flight-plan-settings col-span-2 row-span-2 flex justify-end items-end">
        <div class="w-full h-full">
          <MissionPlanSettings />
        </div>
      </div>
    </div>
  </div>
  
  <style>
    .dashboard {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-template-rows: repeat(2, 1fr);
      height: 95vh;
      background-color: var(--secondaryColor);
    }
    
    .map {
      background-color: var(--primaryColor);
    }

    /* Mobile Styles */
    @media (max-width: 990px) {
      .dashboard-container {
        min-height: fit-content;
        max-height: fit-content;
      }

      .dashboard {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        padding: 0.7em;
        padding-bottom: 5em;
        height: 100%;
        max-height: 100%;
        border-radius: 0;
        overflow-y: auto;
      }

      .dashboard > * {
        width: 100%;
        height: 100%;
        display: block;
        overflow-y: auto;
      }

      .weather {
        display: none;
      }

      .compass{
        display: none;
      }
    }

    @media (max-height: 820px) {
      .compass {
        display: none;
      }
      .weather {
        grid-row: span 4 / span 4;
      }
    }
  </style>
  