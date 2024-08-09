<script lang="ts">
    import { onMount } from 'svelte';
    import { authData } from '../../stores/authStore';
    import Map from '../../components/Map.svelte';
    import Weather from '../../components/Weather.svelte';
    import Compass from '../../components/Compass.svelte';
    import FlightPlan from '../../components/FlightPlan.svelte';
    import FlightPlanSettings from '../../components/FlightPlanSettings.svelte';
  
    let user;
    $: user = $authData;
    const lat: number = 33.749;
    const lon: number = -84.388;
  
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
    <div class="dashboard grid grid-cols-12 grid-rows-7 gap-4 p-6 bg-[#121212] rounded-[30px] overflow-auto max-h-[80vh]">
      <div class="map col-span-10 row-span-4">
        <Map />
      </div>
      <div class="weather col-span-2 row-span-2">
        <Weather {lat} {lon} />
      </div>
      <div class="compass col-span-2 row-span-2">
        <Compass />
      </div>
      <div class="flight-plan col-span-10 row-span-2">
        <FlightPlan />
      </div>
      <div class="flight-plan-settings col-span-2 row-span-2 flex justify-end items-end">
        <div class="w-full h-full">
          <FlightPlanSettings />
        </div>
      </div>
    </div>
  </div>
  
  <style>
    .dashboard {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-template-rows: repeat(2, 1fr);
      height: 95vh;
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
      padding: 0.5em;
      max-height: 92vh;
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
  </style>
  