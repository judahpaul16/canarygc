<script lang="ts">
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../../stores/customizationStore';
  import { onMount } from 'svelte';
  import { loggedInStore } from '../../stores/authStore';

  let darkMode = $derived($darkModeStore);
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');

  let email = $state('');
  let password = $state('');
  let error = $state('');

  onMount(async () => {
    if ($loggedInStore) window.location.href = '/dashboard';
    const response = await fetch('/api/auth/checkAdmin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (!result.adminExists) window.location.href = '/register';
  });

  async function handleSubmit() {
    if (!email || !password) {
      error = 'Please fill in all fields';
      return;
    }
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: email,
        password: password
      }
    });
    if (response.status === 200) {
      loggedInStore.set(true);
      document.cookie = 'lastActivity=' + Date.now();
      window.location.href = '/dashboard';
    } else {
      const responseText = await response.json();
      error = `Error: ${responseText.message}`;
    }
  }
</script>

<svelte:head>
  <title>Canary Ground Control - Login</title>
</svelte:head>

<div
  class="auth"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <div class="card glass">
    <div class="brand">
      <img src="logo.png" alt="Canary Ground Control" class="logo" />
      <h1>Log in to Canary</h1>
      <p class="sub">Ground control for autonomous flight.</p>
    </div>

    {#if error}
      <div class="error"><i class="fas fa-triangle-exclamation"></i> {error}</div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <label for="email">Email</label>
      <input type="email" id="email" bind:value={email} autocomplete="username" required />

      <label for="password">Password</label>
      <input type="password" id="password" bind:value={password} autocomplete="current-password" required />

      <button type="submit" class="cta">Log in <i class="fas fa-arrow-right"></i></button>
    </form>
  </div>
</div>

<style>
  .auth {
    width: 100%;
    min-height: 95vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    color: var(--fontColor);
  }

  .glass {
    background-color: rgb(from var(--primaryColor) r g b / 62%);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 70%);
    border-radius: 1.25rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.28);
  }

  .card {
    width: 100%;
    max-width: 380px;
    padding: 2.25rem 2rem;
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: -45%;
    left: 50%;
    width: 360px;
    height: 360px;
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(245, 197, 24, 0.16), transparent 62%);
    pointer-events: none;
  }

  .brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    margin-bottom: 1.5rem;
  }

  .logo {
    width: 52px;
    height: 52px;
    filter: drop-shadow(0 4px 12px rgba(245, 197, 24, 0.35));
    margin-bottom: 0.35rem;
  }

  .brand h1 {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .sub {
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .error {
    margin-bottom: 1rem;
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    background: rgba(220, 68, 68, 0.15);
    border: 1px solid rgba(220, 68, 68, 0.4);
    color: #ff8f8f;
    font-size: 0.85rem;
  }

  form {
    display: flex;
    flex-direction: column;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.85;
    margin-bottom: 0.35rem;
  }

  input {
    background-color: rgb(from var(--tertiaryColor) r g b / 85%);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 80%);
    color: var(--fontColor);
    border-radius: 0.65rem;
    padding: 0.6rem 0.8rem;
    margin-bottom: 1.1rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  input:focus {
    border-color: #f5c518;
    box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.18);
  }

  .cta {
    margin-top: 0.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: #f5c518;
    color: #1c1c1e;
    font-weight: 700;
    padding: 0.7rem 1.4rem;
    border: none;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(245, 197, 24, 0.35);
    background: #ffd23f;
  }
</style>
