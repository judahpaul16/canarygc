<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authData } from '../../stores/authStore';
  import LiveFeed from '../../components/LiveFeed.svelte';
  import Stats from '../../components/Stats.svelte';
  import Controls from '../../components/Controls.svelte';
  import Compass from '../../components/Compass.svelte';
  import ManageFlightPlans from '../../components/ManageFlightPlans.svelte';

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

<div class="dashboard-container flex items-center justify-center min-h-[95vh] p-6">
  <div class="dashboard grid grid-cols-12 grid-rows-7 gap-4 p-6 bg-[#121212] rounded-[30px] overflow-auto max-h-[800px]">
    <div class="live-feed col-span-6 row-span-4">
      <LiveFeed />
    </div>
    <div class="stats col-span-4 row-span-4">
      <Stats 
        speed={20} 
        height={80} 
        flightTime={360} 
        lens="25 mm" 
        iso={600} 
        frameLine="1920 x 1080" 
        shutter={180} 
        resolution="1280 x 720"
        batteryStatus={100}
        altitudeLimited={100}
        mavName="CUAV X7 Running Ardupilot"
      />
    </div>
    <div class="manage-flight-plans col-span-2 row-span-4">
      <ManageFlightPlans />
    </div>
    <div class="controls col-span-10 row-span-3">
      <Controls />
    </div>
    <div class="compass col-span-2 row-span-3 flex justify-end items-end">
      <div class="w-full h-full">
        <Compass />
      </div>
    </div>
  </div>
</div>

<style>
  /* Mobile Styles */
  @media (max-width: 990px) {
    .dashboard-container {
      padding: 0;
      padding-top: 1.5em;
      min-height: fit-content;
      max-height: fit-content;
    }

    .dashboard {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 0.5em;
      max-height: 86vh;
      overflow-y: auto;
      border-radius: 1em;
    }

    .dashboard > * {
      width: 100%;
      display: block;
    }

    .live-feed {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>