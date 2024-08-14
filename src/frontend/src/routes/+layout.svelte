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
  let heightOfDashboard = 1000;

  $: currentPath = $page.url.pathname;

  $: isNavHidden = currentPath === '/' || currentPath === '/login';

  function updateDashboardHeight() {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      heightOfDashboard = dashboard.clientHeight;
      if (window.location.pathname !== '/') {
        heightOfDashboard = dashboard.clientHeight + 1;
        let nav = document.querySelector('.desktop-nav');
        // @ts-ignore
        nav.style.opacity = 1;
        // @ts-ignore
        dashboard.style.opacity = 1;
      }
    }
  }

  let resizeObserver: ResizeObserver;

  onMount(() => {
    if (typeof window !== 'undefined' && authData.checkExpired() && window.location.pathname !== '/') {
      authData.set(null);
      goto('/login');
    }
    
    initializeFlightPlansCollection();
    initializeMAVLinkLogsCollection();
    
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
    if (window.location.pathname === '/' || window.location.pathname === '/login') {
      // @ts-ignore
      document.querySelector('.desktop-nav').style.display = 'none';
    } else {
      // @ts-ignore
      document.querySelector('.desktop-nav').style.display = 'grid';
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

  async function initializeMAVLinkLogsCollection() {
    try {
      const collections = await pb.collections.getFullList();
      const collectionExists = collections.some(c => c.name === 'mavlink_logs');
      
      if (!collectionExists) {
        const newCollection = {
          name: 'mavlink_logs',
          type: 'base',
          schema: [
            { name: 'title', type: 'text', options: { maxSize: 100000000 } },
            { name: 'actions', type: 'json', required: true, options: { maxSize: 100000000 } }
          ]
        };
        await pb.collections.create(newCollection);
        console.log('Collection "mavlink_logs" created successfully.');
      } else {
        console.log('Collection "mavlink_logs" already exists.');
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
  <div class="bg-[#00000071] flex w-full h-full">
    <!-- Desktop Navigation -->
    <nav class="desktop-nav bg-[#1c1c1e] text-white w-min h-full p-4 grid opacity-0" style="--heightOfDashboard: {heightOfDashboard}px;" class:opacity={!isNavHidden ? 1 : 0}>
      <div class="flex-grow flex flex-col items-center">
        <div class="mb-5">
          <button on:click|preventDefault={() => handleNavigation('/')}>
            <img src="/logo.png" alt="Logo" class="w-12 h-12">
          </button>
        </div>
        {#if $authData}
          <button on:click|preventDefault={() => handleNavigation('/dashboard')} class="nav-button mb-4 {currentPath === '/dashboard' ? 'active' : ''}">
            <i class="nav-icon fas fa-tachometer-alt"></i>
            <div class="tooltip">Dashboard</div>
          </button>
          <button on:click|preventDefault={() => handleNavigation('/mission-planner')} class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
            <i class="nav-icon fas fa-route"></i>
            <div class="tooltip">Mission Planner</div>
          </button>
          <button on:click|preventDefault={() => handleNavigation('/event-log')} class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
            <i class="nav-icon fas fa-bars-staggered"></i>
            <div class="tooltip">Event Log</div>
          </button>
          <div class="separator h-[2px] w-[80%] rounded-2xl bg-[#2d2d2d] mb-4"></div>
          <button on:click|preventDefault={() => handleNavigation('/user-settings')} class="nav-button mb-4 {currentPath === '/user-settings' ? 'active' : ''}">
            <i class="nav-icon fas fa-user"></i>
            <div class="tooltip">User Settings</div>
          </button>
          <button on:click|preventDefault={() => handleNavigation('/notifications')} class="nav-button mb-4 {currentPath === '/notifications' ? 'active' : ''}">
            <i class="nav-icon fas fa-bell"></i>
            <div class="tooltip">Notifications</div>
          </button>
          <button on:click={handleLogout} class="nav-button mb-4">
            <i class="nav-icon fas fa-sign-out-alt"></i>
            <div class="tooltip">Logout</div>
          </button>
        {:else}
          <button on:click|preventDefault={() => handleNavigation('/login')} class="nav-button mb-4 {currentPath === '/login' ? 'active' : ''}">
            <i class="nav-icon fas fa-sign-in-alt"></i>
            <div class="tooltip">Login</div>
          </button>
        {/if}
      </div>
      <div class="flex flex-col justify-self-end gap-3">
        <button class="nav-button" aria-label="GitHub" on:click|preventDefault={() => window.open('https://github.com/MAV-Manager/mmgcs', '_blank')}>
          <i class="nav-icon fab fa-github"></i>
          <div class="tooltip">GitHub</div>
        </button>
        <div class="separator h-[2px] w-[80%] mx-auto mb-2 rounded-2xl bg-[#2d2d2d]"></div>
        <button class="nav-button" aria-label="FAA Rules" on:click|preventDefault={() => window.open('https://www.faa.gov/uas', '_blank')}>
          <i class="nav-icon fas fa-plane-circle-exclamation"></i>
          <div class="tooltip">FAA Rules and Regulations for Unmanned Aircraft Systems (UAS)</div>
        </button>
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
          <a href="/mission-planner" on:click|preventDefault={() => handleNavigation('/mission-planner')} class="nav-button mb-4 {currentPath === '/mission-planner' ? 'active' : ''}">
            <i class="nav-icon fas fa-route"></i>&nbsp;&nbsp;Mission Planner
          </a>
          <a href="/event-log" on:click|preventDefault={() => handleNavigation('/event-log')} class="nav-button mb-4 {currentPath === '/event-log' ? 'active' : ''}">
            <i class="nav-icon fas fa-bars-staggered"></i>&nbsp;&nbsp;Event Log
          </a>
          <a href="/user-settings" on:click|preventDefault={() => handleNavigation('/user-settings')} class="nav-button mb-4 {currentPath === '/user-settings' ? 'active' : ''}">
            <i class="nav-icon fas fa-user"></i>&nbsp;&nbsp;User Settings
          </a>
          <a href="/notifications" on:click|preventDefault={() => handleNavigation('/notifications')} class="nav-button mb-4 {currentPath === '/notifications' ? 'active' : ''}">
            <i class="nav-icon fas fa-bell"></i>&nbsp;&nbsp;Notifications
          </a>
          <button on:click|preventDefault={handleLogout} class="nav-button mb-4" type="button">
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
  </div>
</main>

<style>
  main {
    background: url('background.png') no-repeat center center fixed;
    background-size: cover;
    margin: 0;
  }

  .desktop-nav {
    align-content: space-between;
    align-self: center;
    border: 5px solid #121212;
    border-right: none;
    border-radius: 30px 0 0 30px;
    margin-left: 2em;
    max-height: 90vh;
    height: var(--heightOfDashboard);
    transition: height 0s;
    transition: opacity 0.25s;
  }

  .nav-button {
    width: 40px;
    height: 40px;
    display: flex;
    position: relative;
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

  .tooltip {
    position: absolute;
    top: 0;
    left: 0;
    margin-bottom: 0.5rem;
    background-color: black;
    color: white;
    padding: 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
    z-index: 1;
    transform: translateX(50px);
  }

  .nav-button:hover .tooltip {
    opacity: 1;
    visibility: visible;
  }


  /* Mobile Styles */
  @media (max-width: 990px) {
    main > div {
      flex-direction: column;
    } 

    .slot-container {
      padding: 0;
      overflow: hidden;
    }

    .desktop-nav {
      display: none !important;
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
