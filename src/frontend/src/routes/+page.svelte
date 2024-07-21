<script lang="ts">
  import { authData } from '../stores/authStore';

  let user;
  $: user = $authData;
</script>

<div class="flex items-center justify-center h-full">
  <div class="bg-gray-900 bg-opacity-75 text-white p-8 rounded-lg shadow-lg max-w-md w-full">
    <h1 class="text-3xl font-bold mb-4 text-center">Welcome to AirSend</h1>
    {#if user}
      <p class="text-lg text-center">Hello, {user?.record?.name || 'admin'}!
        Continue to <a href="/dashboard" class="text-blue-500 underline">dashboard</a>.
      </p>
    {:else}
      <p class="text-lg text-center">You are not logged in. Please <a href="/login" class="text-blue-500 underline">login</a>.</p>
    {/if}
    <!-- Changelog -->
    <div class="mt-4 changelog">
      <h2 class="text-xl font-bold mb-2">Changelog</h2>
      <ul class="styled-list">
        <li><em>Added login + dashboard page</em></li>
        <li><em>Added login/logout functionality</em></li>
        <li><em>Added interactive map</em></li>
      </ul>
    </div>
    <!-- Work In Progress -->
    <div class="mt-4 wip">
      <h2 class="text-xl font-bold mb-2">Work In Progress</h2>
      <ul class="styled-list">
        <li><em>Get live video feed</em></li>
        <li><em>Get live stats</em></li>
        <li><em>Get live GPS data</em></li>
        <li><em>Get/Set flight route and get progress</em></li>
        <li><em>Implement flight controls</em></li>
        <li><em>Fleet Management: Self-Host vs SaaS</em></li>
      </ul>
    </div>
  </div>
</div>

<style>
  .changelog {
    border-left: 3px solid #58a6ff;
    padding-left: 1rem;
  }

  .wip {
    border-left: 3px solid #ffcb5a;
    padding-left: 1rem;
  }

  .changelog h2, .wip h2 {
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
</style>
