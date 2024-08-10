<script lang="ts">
  import PocketBase from 'pocketbase';
  import { authData } from '../../stores/authStore';
  import { goto } from '$app/navigation';

  const pb = new PocketBase('http://localhost:8090');

  let email = '';
  let password = '';
  let error = '';

  async function login() {
    try {
      const authDataResponse = await pb.admins.authWithPassword(email, password);
      authData.set(authDataResponse);
      goto('/dashboard');
    } catch (err: any) {
      try {
        const authDataResponse = await pb.collection('users').authWithPassword(email, password);
        authData.set(authDataResponse);
        goto('/dashboard');
      } catch (err: any) {
        error = err.message;
      }
    }
  }
</script>

<sveltekit:head>
  <title>MAV Manager GCS - Login</title>
</sveltekit:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
  <div class="dashboard w-fit h-fit flex flex-col justify-center text-white p-10 bg-[#121212bd] rounded-[30px]">
    <h2 class="text-2xl font-bold mb-4 text-center">Login</h2>
    {#if error}
      <div class="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>
    {/if}
    <form on:submit|preventDefault={login}>
      <div class="mb-4">
        <label for="email" class="block text-gray-300">Email</label>
        <input type="email" id="email" bind:value={email} class="w-full px-3 py-2 border rounded text-black" required />
      </div>
      <div class="mb-4">
        <label for="password" class="block text-gray-300">Password</label>
        <input type="password" id="password" bind:value={password} class="w-full px-3 py-2 border rounded text-black" required />
      </div>
      <button type="submit" class="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600">Login</button>
    </form>
  </div>
</div>
