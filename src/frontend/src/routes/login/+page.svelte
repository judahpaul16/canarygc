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
  <div class="dashboard w-fit h-fit flex flex-col justify-center text-white p-10 bg-[#121212d5] rounded-3xl">
    <h2 class="text-2xl font-bold mb-4 text-center">Login to GCS</h2>
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
      <button type="submit" class="w-full py-2 rounded">Submit</button>
    </form>
  </div>
</div>


<style>
  input[type="email"],
  input[type="password"] {
    background-color: #2d2d2d;
    color: white;
    border: 1px solid #1c1c1e;
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