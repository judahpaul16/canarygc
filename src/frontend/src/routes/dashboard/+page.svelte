<script lang="ts">
  import { authData } from '../../stores/authStore';
  import LiveFeed from '../../components/LiveFeed.svelte';
  import Stats from '../../components/Stats.svelte';
  import Controls from '../../components/Controls.svelte';
  import Compass from '../../components/Compass.svelte';
  import ManageFlightPlans from '../../components/ManageFlightPlans.svelte';
  import { mavLocationStore } from '../../stores/mapStore';

  $: user = $authData;
  $: mavLocation = $mavLocationStore

</script>

<sveltekit:head>
  <title>MAV Manager GCS - Dashboard</title>
</sveltekit:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
  <div class="dashboard grid grid-cols-12 grid-rows-7 gap-4 p-6 bg-[#121212] rounded-[30px] overflow-auto max-h-[90vh]">
    <div class="live-feed col-span-6 row-span-4">
      <LiveFeed />
    </div>
    <div class="stats col-span-4 row-span-4">
      <Stats 
        speed={20} 
        altitude={80} 
        flightTime={360} 
        batteryStatus={100}
        altitudeLimited={100}
        mavName="CUAV X7 Running Ardupilot"
        mavType="Multirotor"
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
        <Compass {mavLocation} />
      </div>
    </div>
  </div>
</div>

<style>
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
      padding: 0.5em;
      max-height: 92vh;
      border-radius: 0;
      overflow-y: auto;
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

    .compass {
      display: none;
    }
  }
</style>