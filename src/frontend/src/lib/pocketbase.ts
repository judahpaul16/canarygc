import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';

const pb = new PocketBase('http://127.0.0.1:8090');

export const currentUser = writable(pb.authStore.model);

pb.authStore.onChange((auth) => {
  console.log('authStore changed', auth);
  currrentUser.set(pb.authStore.model);

});
