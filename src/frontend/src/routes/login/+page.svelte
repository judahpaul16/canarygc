<script lang="ts">
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../../stores/customizationStore';
  import { onMount } from 'svelte';
  import { loggedInStore } from '../../stores/authStore';

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';

  let email = '';
  let password = '';
  let error = '';
  let passwordStrength = 0;
  
  onMount(async () => {    
    if ($loggedInStore) window.location.href = '/dashboard';
    await fetch('/api/auth/checkAdmin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(async (response) => {
      let result = await response.json();
      if (!result.adminExists) {
          window.location.href = '/register';
      }
    });

    // Set up input focus handlers
    setTimeout(() => {
      const inputs = ['email', 'password', 'confirmPassword']
        .map(id => document.getElementById(id) as HTMLInputElement)
        .filter(Boolean);

      // Manage autofocus dynamically
      inputs.forEach(input => {
        ['focus', 'click'].forEach(event => {
          input.addEventListener(event, () => {
            // Ensure only the current input has autofocus
            inputs.forEach(i => i.removeAttribute('autofocus'));
            input.setAttribute('autofocus', 'true');
          });
        });
      });
    }, 1000);
  });

  async function handleSubmit() {
    if (!email || !password) {
      error = 'Please fill in all fields';
      return;
    }
    let response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'username': email,
        'password': password
      },
    })
    if (response.status === 200) {
      loggedInStore.set(true);
      document.cookie = 'lastActivity=' + Date.now();
      window.location.href = '/dashboard';
    } else {
      let responseText = await response.json();
      error = `Error: ${responseText.message}`;
    }
  }

  function calculatePasswordStrength(pass: string): number {
    let strength = 0;
    if (pass.length >= 10) strength += 1;
    if (pass.match(/[a-z]/) && pass.match(/[A-Z]/)) strength += 1;
    if (pass.match(/\d/)) strength += 1;
    if (pass.match(/[^a-zA-Z\d]/)) strength += 1;
    return strength;
  }

  function getPasswordStrengthColor(strength: number): string {
    const colors = ['#ff4444', '#ffbb33', '#00C851', '#33b5e5'];
    return colors[strength - 1] || '#ff4444';
  }

  function getPasswordStrengthText(strength: number): string {
    const texts = ['Weak', 'Fair', 'Good', 'Strong'];
    return texts[strength - 1] || 'Too Weak';
  }

  $: passwordStrength = calculatePasswordStrength(password);
</script>

<sveltekit:head>
  <title>Canary Ground Control - Login</title>
</sveltekit:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0" 
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <div class="dashboard w-fit h-fit flex flex-col justify-center p-10 rounded-3xl max-w-[400px]">
    <h2 class="text-2xl font-bold mb-4 text-center">
      Login to GCS
    </h2>
    {#if error}
      <div class="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>
    {/if}
    <form on:submit|preventDefault={handleSubmit}>
      <div class="mb-4">
        <label for="email" class="block">Email</label>
        <input type="email" id="email" bind:value={email} class="w-full px-3 py-2 rounded" required />
      </div>
      <div class="mb-4">
        <label for="password" class="block">Password</label>
        <input type="password" id="password" bind:value={password} class="w-full px-3 py-2 rounded" required />
      </div>
      <button type="submit" class="w-full py-2 rounded">
        Login
      </button>
    </form>
  </div>
</div>

<style>
  .dashboard {
    background-color: rgb(from var(--primaryColor) r g b / 75%);
    border: 2px solid var(--secondaryColor);
    color: var(--fontColor);
    margin-right: 0 !important;
  }
  label {
    color: var(--fontColor);
    margin-bottom: 0.3em;
  }
  input[type="email"],
  input[type="password"] {
    background-color: var(--tertiaryColor);
    border: 2px solid var(--secondaryColor);
    color: var(--fontColor);
    border-radius: 10px;
  }
  button {
    background-color: #2c7dd3;
    color: white;
    border: none;
    border-radius: 10px;
    cursor: pointer;
  }
  button:hover {
    background-color: #1a5696;
  }
</style>