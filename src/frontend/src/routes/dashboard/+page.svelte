<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authData } from '../../stores/authStore';
  import LiveFeed from '../../components/LiveFeed.svelte';
  import Stats from '../../components/Stats.svelte';
  import Controls from '../../components/Controls.svelte';
  import Compass from '../../components/Compass.svelte';

  let user;
  $: user = $authData;

  onMount(() => {
    if (!user) {
      goto('/login');
    }
  });
</script>

<div class="dashboard grid grid-cols-12 grid-rows-6 gap-4 p-6 bg-[#121212] h-[95vh] rounded-[30px] overflow-auto">
  <div class="col-span-7 row-span-3">
    <LiveFeed />
  </div>
  <div class="col-span-5 row-span-3">
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
      droneName="CUAV X7 Running Ardupilot"
    />
  </div>
  <div class="col-span-10 row-span-3">
    <Controls />
  </div>
  <div class="col-span-2 row-span-3 flex justify-end items-end">
    <div class="w-full h-full">
      <Compass />
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
