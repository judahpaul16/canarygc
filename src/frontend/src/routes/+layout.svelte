<script lang="ts">
  import PocketBase from 'pocketbase';
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { authData } from '../stores/authStore';
  import { page } from '$app/stores';
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { goto } from '$app/navigation';
  import '../app.css';

  const pb = new PocketBase('http://localhost:8090');

  let currentPath = '';
  $: currentPath = $page.url.pathname;
  let heightOfDashboard = 800;

  function updateDashboardHeight() {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      heightOfDashboard = dashboard.clientHeight;
    }
  }

  let resizeObserver: ResizeObserver;

  onMount(() => {
    if (typeof window !== 'undefined' && authData.checkExpired() && window.location.pathname !== '/') {
      authData.set(null);
      goto('/login');
    }
    
    initializeFlightPlansCollection();
    
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      resizeObserver = new ResizeObserver(() => {
        updateDashboardHeight();
      });
      resizeObserver.observe(dashboard);
    }
    
    updateDashboardHeight();
  });

  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  afterUpdate(() => {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      resizeObserver = new ResizeObserver(() => {
        updateDashboardHeight();
      });
      resizeObserver.observe(dashboard);
    }
  });

  async function initializeFlightPlansCollection() {
    try {
      const collections = await pb.collections.getFullList();
      const collectionExists = collections.some(c => c.name === 'flight_plans');
      
      if (!collectionExists) {
        const newCollection = {
          name: 'flight_plans',
          type: 'base',
          schema: [
            { name: 'title', type: 'text', options: { maxSize: 100000000 } },
            { name: 'actions', type: 'json', required: true, options: { maxSize: 100000000 } }
          ]
        };
        await pb.collections.create(newCollection);
        console.log('Collection "flight_plans" created successfully.');
      } else {
        console.log('Collection "flight_plans" already exists.');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  function handleNavigation(path: string) {
    if (currentPath !== path) {
      goto(path);
    }
  }

  function handleLogout() {
    authData.set(null);
    goto('/login');
  }

  let isNavOpen = false;
  function toggleNav() {
    isNavOpen = !isNavOpen;
  }
</script>

<main class="flex overflow-auto">
  <!-- Desktop Navigation -->
  <nav class="desktop-nav bg-[#1c1c1e] text-white w-min h-full p-4" style="--heightOfDashboard: {heightOfDashboard}px;">
    <div class="mb-4">
      <a href="/" on:click|preventDefault={() => handleNavigation('/')}>
        <img src="/logo.png" alt="Logo" class="w-12 h-12">
      </a>
    </div>
    <div class="flex-grow flex flex-col items-center">
      {#if $authData}
        <a href="/dashboard" on:click|preventDefault={() => handleNavigation('/dashboard')} class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
          <i class="nav-icon fas fa-tachometer-alt"></i>
        </a>
        <a href="/flight-planner" on:click|preventDefault={() => handleNavigation('/flight-planner')} class="nav-button mb-4 {currentPath === '/flight-planner' ? 'active' : ''}">
          <i class="nav-icon fas fa-route"></i>
        </a>
        <a href="/profile" on:click|preventDefault={() => handleNavigation('/notifications')} class="nav-button mb-4 {currentPath === '/notifications' ? 'active' : ''}">
          <i class="nav-icon fas fa-bell"></i>
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

  <!-- Mobile Navigation -->
  <nav class="mobile-nav bg-[#1c1c1e] text-white p-4 md:hidden flex flex-col">
    <div class="flex justify-between items-center">
      <button class="nav-button" aria-label="Toggle Navigation" on:click={toggleNav}>
        <i class="nav-icon fas fa-bars"></i>
      </button>
      <span class="text-xl font-semibold">MAV Manager GCS</span>
      <a href="/" on:click|preventDefault={() => handleNavigation('/')}>
        <img src="/logo.png" alt="Logo" class="w-8 h-8">
      </a>
    </div>
    <div class={`mobile-nav-links ${isNavOpen ? 'block' : 'hidden'} flex flex-col items-center mt-4`}>
      {#if $authData}
        <a href="/dashboard" on:click|preventDefault={() => handleNavigation('/dashboard')} class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
          <i class="nav-icon fas fa-tachometer-alt"></i>&nbsp;&nbsp;Dashboard
        </a>
        <a href="/flight-planner" on:click|preventDefault={() => handleNavigation('/flight-planner')} class="nav-button mb-4 {currentPath === '/flight-planner' ? 'active' : ''}">
          <i class="nav-icon fas fa-route"></i>&nbsp;&nbsp;Flight Planner
        </a>
        <a href="/profile" on:click|preventDefault={() => handleNavigation('/notifications')} class="nav-button mb-4 {currentPath === '/notifications' ? 'active' : ''}">
          <i class="nav-icon fas fa-bell"></i>&nbsp;&nbsp;Notification Settings
        </a>
        <button on:click={handleLogout} class="nav-button mb-4">
          <i class="nav-icon fas fa-sign-out-alt"></i>&nbsp;&nbsp;Logout
        </button>
      {:else}
        <a href="/login" on:click|preventDefault={() => handleNavigation('/login')} class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
          <i class="nav-icon fas fa-sign-in-alt"></i>&nbsp;&nbsp;Login
        </a>
      {/if}
    </div>
  </nav>

  <div class="slot-container flex-grow pr-8 justify-center items-center overflow-auto">
    <slot />
  </div>
</main>

<style>
  main {
    background: url('background.png') no-repeat center center fixed;
    background-size: cover;
    margin: 0;
  }

  .desktop-nav {
    display: grid;
    align-content: baseline;
    align-self: center;
    border: 5px solid #121212;
    border-right: none;
    border-radius: 30px 0 0 30px;
    margin-left: 2em;
    max-height: 90vh;
    height: var(--heightOfDashboard);
    transition: height 0s;
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

  .nav-button:hover {
    background-color: #2d2d2d;
  }

  .nav-button:hover, .nav-button.active {
    color: white;
  }

  .nav-button.active {
    background-color: #141414;
  }

  .nav-icon {
    font-size: 18px;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    main {
      flex-direction: column;
    } 

    .slot-container {
      padding: 0;
      overflow: hidden;
    }

    .desktop-nav {
      display: none;
    }

    .mobile-nav {
      display: flex;
    }

    .mobile-nav-links {
      display: flex;
      flex-direction: column;
      width: 100%;
    }

    .mobile-nav-links a, .mobile-nav-links button {
      width: 100%;
      text-align: center;
    }

    .mobile-nav-links.hidden {
      display: none;
    }
  }
</style>
