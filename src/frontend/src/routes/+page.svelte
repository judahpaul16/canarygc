<script lang="ts">
  import { authData } from '../stores/authStore';

  let user;
  $: user = $authData;
</script>

<sveltekit:head>
  <title>MAV Manager GCS - Home</title>
</sveltekit:head>

<div class="flex items-center justify-center h-full">
  <div class="bg-[#121212bd] text-white p-8 rounded-2xl shadow-lg max-w-md w-full">
    <h1 class="text-3xl font-bold mb-4 text-center">MAV Manager GCS</h1>
    {#if user}
      <p class="text-lg text-center">Hello, {user?.record?.name || 'admin'}!
        Continue to <a href="/dashboard" class="text-blue-500 underline">dashboard</a>.
      </p>
    {:else}
      <p class="text-lg text-center">You are not logged in. Please <a href="/login" class="text-blue-500 underline">login</a>.</p>
    {/if}
    <!-- Useful Documentation -->
      <!-- MAVLink -->
      <div class="mt-4 mavlink">
        <h2 class="text-lg font-bold mb-2">MAVLink</h2>
        <ul class="styled-list">
          <li><a href="https://mavlink.io/en/" target="_blank">MAVLink</a></li>
          <li><a href="https://mavlink.io/en/messages/common.html" target="_blank">Common MAVLink Messages</a></li>
          <li><a href="https://ardupilot.org/copter/docs/mission-command-list.html" target="_blank">Copter Mission Command List</a></li>
          <li><a href="https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html" target="_blank">Common MAVLink Mission Command Messages</a></li>
          <li><a href="https://ardupilot.org/copter/docs/auto-mode.html" target="_blank">Auto Mode</a></li>
          <li><a href="https://ardupilot.org/planner/docs/common-loading-firmware-onto-pixhawk.html" target="_blank">Loading Firmware onto Pixhawk</a></li>
        </ul>
      </div>
      <!-- Safety -->
      <div class="mt-4 safety">
        <h2 class="text-lg font-bold mb-2">Safety</h2>
        <ul class="styled-list">
          <li><a href="https://dronesafetymap.com" target="_blank">Drone Safety Map</a></li>
          <li><a href="https://ardupilot.org/copter/docs/common-prearm-safety-checks.html" target="_blank">Prearm Safety Checks</a></li>
          <li><a href="https://www.faa.gov/uas" target="_blank">FAA Rules and Regulations for UAS</a></li>
        </ul>
      </div>
  </div>
</div>

<style>
  .mavlink {
    border-left: 3px solid #58a6ff;
    padding-left: 1rem;
  }

  .safety {
    border-left: 3px solid #ffcb5a;
    padding-left: 1rem;
  }

  .mavlink h2, .safety h2 {
    margin-top: 0;
  }

  .styled-list {
    list-style-type: none;
    padding: 0;
    margin: 0;
  }

  .styled-list li {
    position: relative;
    padding-left: 1.5rem;
    margin-bottom: 0.5rem;
    font-style: italic;
  }

  .styled-list li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: #58a6ff;
    font-size: 1.2rem;
  }

  a {
    text-decoration: none;
    color: #58a6ff;
  }
  a:hover {
    color: white;
  }
</style>
