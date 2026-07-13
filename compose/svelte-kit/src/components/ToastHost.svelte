<script lang="ts">
  import { flip } from 'svelte/animate';
  import { toastStore } from '../stores/toastStore';
  import Toast from './Toast.svelte';
</script>

<div class="toast-host" aria-label="Notifications">
  {#each $toastStore as toast (toast.id)}
    <div animate:flip={{ duration: 200 }}>
      <Toast {...toast} />
    </div>
  {/each}
</div>

<style>
  .toast-host {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  }
  .toast-host > :global(*) {
    pointer-events: auto;
  }
</style>
