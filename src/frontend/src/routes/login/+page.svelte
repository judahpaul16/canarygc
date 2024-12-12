<script lang="ts">
  import PocketBase from 'pocketbase';
  import { authData } from '../../stores/authStore';
  import { goto } from '$app/navigation';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../../stores/customizationStore';
  import { onMount } from 'svelte';

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';

  let email = '';
  let password = '';
  let confirmPassword = '';
  let error = '';
  let isRegistrationMode = false;
  let passwordStrength = 0;
  let pb: PocketBase;
  
  onMount(async () => {
    pb = new PocketBase(`http://${window.location.hostname}:8090`);
    pb.autoCancellation(false);
    
    try {
      // Check if admin exists
      const adminList = await pb.admins.getList(1, 1);
      isRegistrationMode = adminList.items.length === 0;
    } catch (err) {
      console.error('Error checking admin existence:', err);
      isRegistrationMode = true; // Assume registration needed if can't check
    }

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

  async function handleSubmit() {
    error = '';
    
    if (isRegistrationMode) {
      if (password !== confirmPassword) {
        error = 'Passwords do not match';
        return;
      }
      if (passwordStrength < 3) {
        error = 'Password is not strong enough';
        return;
      }
      
      try {
        const adminData = await pb.admins.create({
          email,
          password,
          passwordConfirm: confirmPassword,
        });
        const authDataResponse = await pb.admins.authWithPassword(email, password);
        authData.set({
          token: authDataResponse.token,
          expires: Date.now() + 3600 * 1000, // Set expiration to 1 hour from now
          admin: authDataResponse.admin,
          record: null, // Set record to null since it's an admin response
        });
        goto('/dashboard');
      } catch (err: any) {
        error = err.message;
      }
    } else {
      try {
        const authDataResponse = await pb.admins.authWithPassword(email, password);
        authData.set({
          token: authDataResponse.token,
          expires: Date.now() + 3600 * 1000, // Set expiration to 1 hour from now
          admin: authDataResponse.admin,
          record: null, // Set record to null since it's an admin response
        });
        goto('/dashboard');
      } catch (err: any) {
        try {
          const authDataResponse = await pb.collection('users').authWithPassword(email, password);
          authData.set({
            token: authDataResponse.token,
            expires: Date.now() + 3600 * 1000, // Set expiration to 1 hour from now
            admin: null, // Set admin to null since it's a user response
            record: null, // Set record to null since it's an admin response
          });
          goto('/dashboard');
        } catch (err: any) {
          error = err.message;
        }
      }
    }
  }
</script>

<sveltekit:head>
  <title>MAV Manager GCS - {isRegistrationMode ? 'Register' : 'Login'}</title>
</sveltekit:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0" 
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <div class="dashboard w-fit h-fit flex flex-col justify-center p-10 rounded-3xl max-w-[400px]">
    <h2 class="text-2xl font-bold mb-4 text-center">
      {isRegistrationMode ? 'Create Admin Account' : 'Login to GCS'}
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
        {#if isRegistrationMode}
          <div class="mt-2">
            <div class="flex justify-start items-center">
              <div class="text-sm min-w-fit mr-3">{getPasswordStrengthText(passwordStrength)}</div>
              <div class="w-[70%] h-2 bg-gray-200 rounded">
                <div
                  class="h-full rounded transition-all duration-300"
                  style="width: {(passwordStrength / 4) * 100}%; background-color: {getPasswordStrengthColor(passwordStrength)}"
                ></div>
              </div>
            </div>
            <div class="text-xs mt-1">
              Password must contain at least 10 characters, including uppercase, lowercase, numbers, and special characters
            </div>
          </div>
        {/if}
      </div>
      {#if isRegistrationMode}
        <div class="mb-4">
          <label for="confirmPassword" class="block">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            bind:value={confirmPassword}
            class="w-full px-3 py-2 rounded"
            required
          />
        </div>
      {/if}
      <button type="submit" class="w-full py-2 rounded">
        {isRegistrationMode ? 'Create Account' : 'Login'}
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