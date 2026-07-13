<script lang="ts">
    import { onMount } from 'svelte';
    import Weather from '../../components/Weather.svelte';
    import Compass from '../../components/Compass.svelte';
    import MissionPlan from '../../components/MissionPlan.svelte';
    import MissionPlanSettings from '../../components/MissionPlanSettings.svelte';
    import { mavLocationStore } from '../../stores/mavlinkStore';
    import { mapWindow, mapShell } from '../../lib/map-window';

    let mavLocation = $derived($mavLocationStore)

    onMount(() => {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 1000);
    });
  </script>
  
  <sveltekit:head>
    <title>Canary Ground Control - Dashboard</title>
  </sveltekit:head>

  <div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full grid grid-cols-12 gap-4 p-5 rounded-3xl rounded-l-none overflow-auto max-h-[90vh]"
      use:mapShell
    >
      <div class="map col-span-10 row-span-4 rounded-2xl" use:mapWindow={{ overlay: true }}></div>
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
    /* Six equal rows keep the section cards aligned: the map spans four rows
       flush with weather plus compass, and the plan card's two rows flush with
       the settings card. The stable gutter keeps the grid width constant
       whether or not the page scrollbar shows, so the map window rect the
       floating controls pin to never drifts by a scrollbar width. */
    .dashboard {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-template-rows: repeat(4, minmax(0, 0.92fr)) repeat(2, minmax(0, 1.16fr));
      height: 95vh;
      scrollbar-gutter: stable;
      background-color: transparent !important;
      box-shadow: none !important;
    }

    /* The layout grants every page root pointer-events so ordinary pages stay
       clickable over the map layer; map pages hand the map area back. The
       element prefix outranks that grant instead of tying with it, since a tie
       leaves the winner to bundle order. */
    div.dashboard-container,
    div.dashboard-container .dashboard {
      pointer-events: none;
    }

    .dashboard > * {
      pointer-events: auto;
    }

    .dashboard > .map {
      pointer-events: none;
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
        height: auto;
        flex: none;
        display: block;
      }

      .dashboard > .map {
        height: 45vh;
        min-height: 280px;
        overflow: hidden;
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
  