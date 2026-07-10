<script lang="ts">
  import LiveFeed from '../../components/LiveFeed.svelte';
  import Stats from '../../components/Stats.svelte';
  import Controls from '../../components/Controls.svelte';
  import Compass from '../../components/Compass.svelte';
  import ManageMissionPlans from '../../components/ManageMissionPlans.svelte';
  import { mavLocationStore } from '../../stores/mavlinkStore';
  import { secondaryColorStore } from '../../stores/customizationStore';

  let mavLocation = $derived($mavLocationStore);
  let secondaryColor = $derived($secondaryColorStore);

</script>

<svelte:head>
  <title>Canary Ground Control - Dashboard</title>
</svelte:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
  <div
    class="dashboard w-full grid grid-cols-12 grid-rows-7 gap-5 p-5 rounded-[30px] rounded-l-none overflow-auto h-[90vh] max-h-[720px]"
    style="--secondaryColor: {secondaryColor}"
  >
      <div class="cell live-feed col-span-6 row-span-4">
        <LiveFeed />
      </div>
      <div class="cell stats col-span-4 row-span-4">
        <Stats />
      </div>
      <div class="cell manage-flight-plans col-span-2 row-span-4">
        <ManageMissionPlans />
      </div>
      <div class="cell controls col-span-10 row-span-3">
        <Controls />
      </div>
      <div class="cell compass col-span-2 row-span-3 flex justify-end items-end">
        <div class="w-full h-full">
          <Compass {mavLocation} />
        </div>
      </div>
  </div>
</div>

<style>
  .cell {
    border-radius: 1.1rem;
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.3);
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
      padding: 0.7em;
      padding-right: 0;
      padding-bottom: 5em;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
      overflow: auto;
    }

    .dashboard > * {
      width: 100%;
      display: block;
    }

    .compass {
      display: none;
    }
  }
</style>