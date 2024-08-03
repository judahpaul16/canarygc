<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { authData } from '../stores/authStore';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import '../app.css';

  let currentPath = '';
  $: currentPath = $page.url.pathname;

  onMount(() => {
    if (typeof window !== 'undefined' && authData.checkExpired()) {
      authData.set(null);
      goto('/login');
    }
  });

  function handleNavigation(path: string) {
    if (currentPath !== path) {
      goto(path);
    }
  }

  function handleLogout() {
    authData.set(null);
    goto('/login');
  }
</script>

<main class="flex overflow-auto">
  <nav class="bg-[#1c1c1e] text-white w-min h-full p-4">
    <div class="mb-4">
      <a href="/" on:click|preventDefault={() => handleNavigation('/')}>
        <img src="/logo.png" alt="Logo" class="w-12 h-12">
      </a>
    </div>
    <div class="flex-grow flex flex-col items-center">
      <a href="/" on:click|preventDefault={() => handleNavigation('/')} class="nav-button mb-4 {currentPath === '/' ? 'active' : ''}">
        <i class="nav-icon fas fa-home"></i>
      </a>
      {#if $authData}
        <a href="/dashboard" on:click|preventDefault={() => handleNavigation('/dashboard')} class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
          <i class="nav-icon fas fa-tachometer-alt"></i>
        </a>
        <a href="/flight-planner" on:click|preventDefault={() => handleNavigation('/flight-planner')} class="nav-button mb-4 {currentPath === '/flight-planner' ? 'active' : ''}">
          <i class="nav-icon fas fa-route"></i>
        </a>
        <a href="/profile" on:click|preventDefault={() => handleNavigation('/profile')} class="nav-button mb-4 {currentPath === '/profile' ? 'active' : ''}">
          <i class="nav-icon fas fa-user"></i>
        </a>
        <button on:click={handleLogout} class="nav-button mb-4">
          <i class="nav-icon fas fa-sign-out-alt"></i>
        </button>
      {:else}
        <a href="/login" on:click|preventDefault={() => handleNavigation('/login')} class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
          <i class="nav-icon fas fa-sign-in-alt"></i>
        </a>
      {/if}
    </div>
  </nav>
  <div class="flex-grow p-4">
    <slot />
  </div>
</main>

<style>
  main {
    background: url('background.png') no-repeat center center fixed;
    background-size: cover;
    margin: 0;
  }

  .nav-button {
    width: 40px;
    height: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: transparent;
    border-radius: 5px;
    color: #8d8d8e;
  }

  .nav-button:hover, .nav-button:active {
    color: white;
  }

  .nav-button.active {
    background-color: #141414;
  }

  .nav-icon {
    font-size: 18px;
  }
</style>
