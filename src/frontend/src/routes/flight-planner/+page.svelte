<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { authData } from '../../stores/authStore';
    import Map from '../../components/Map.svelte';
    import Weather from '../../components/Weather.svelte';
    import FlightPlan from '../../components/FlightPlan.svelte';
    import FlightPlanSettings from '../../components/FlightPlanSettings.svelte';
  
    let user;
    $: user = $authData;
    const lat: number = 33.749;
    const lon: number = -84.388;
  
    onMount(() => {
      if (!user) {
        goto('/login');
      }
    });
  </script>
  
  <sveltekit:head>
    <title>MAV Manager GCS - Dashboard</title>
  </sveltekit:head>

  <div class="flex items-center justify-center min-h-[95vh] p-6">
    <div class="dashboard grid grid-cols-12 grid-rows-6 gap-4 p-6 bg-[#121212] h-[95vh] rounded-[30px] overflow-auto max-h-[700px]">
      <div class="col-span-10 row-span-4">
        <Map />
      </div>
      <div class="col-span-2 row-span-4">
        <Weather {lat} {lon} />
      </div>
      <div class="col-span-10 row-span-2">
        <FlightPlan />
      </div>
      <div class="col-span-2 row-span-2 flex justify-end items-end">
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
  </style>
  