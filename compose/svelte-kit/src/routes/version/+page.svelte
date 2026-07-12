<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props();
  onMount(() => {
    const prevTitle = document.title;
    document.title = 'Build info - Canary Ground Control';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => {
      document.title = prevTitle;
      document.head.removeChild(robots);
    };
  });

  const rows = $derived([
    { label: 'Version', value: data.version },
    { label: 'Commit', value: data.commit },
    { label: 'Built at', value: data.buildDate }
  ]);
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
  <div class="dashboard w-full flex items-center justify-center p-5 rounded-3xl rounded-l-none h-[90vh] max-h-[90vh]">
  <div
    class="w-full max-w-md rounded-2xl border p-6 shadow-md"
    style="background-color: var(--primaryColor); color: var(--fontColor); border-color: var(--secondaryColor);"
  >
    <h1 class="text-xl font-bold">Build info</h1>
    <p class="mt-1 text-sm opacity-60">Canary Ground Control</p>
    <dl class="mt-5 text-sm">
      {#each rows as row, i (row.label)}
        <div class="flex items-center justify-between gap-4 py-3 {i < rows.length - 1 ? 'border-b' : ''}" style="border-color: var(--secondaryColor);">
          <dt class="font-semibold opacity-80">{row.label}</dt>
          <dd class="rounded-lg px-2 py-1 font-mono" style="background-color: var(--secondaryColor);">{row.value}</dd>
        </div>
      {/each}
    </dl>
    <a href="/" class="mt-6 inline-block text-sm font-semibold text-[#62bbff] hover:underline">&larr; Back to home</a>
  </div>
  </div>
</div>

<style>
  @media (max-width: 990px) {
    .dashboard {
      border-radius: 0;
      padding: 0.7em;
    }
  }
</style>
