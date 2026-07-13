import { writable } from 'svelte/store';

export type FeedView = 'feed' | 'hud' | 'hybrid';

const KEY = 'feedView';

function stored(): FeedView | null {
  if (typeof sessionStorage === 'undefined') return null;
  const v = sessionStorage.getItem(KEY);
  return v === 'feed' || v === 'hud' || v === 'hybrid' ? v : null;
}

let userChose = stored() !== null;

export const feedViewStore = writable<FeedView>(stored() ?? 'hud');
export const feedAvailableStore = writable<boolean>(false);

// A manual toggle persists the choice; feed detection no longer moves the view
// once the operator has picked one.
export function setFeedView(mode: FeedView): void {
  userChose = true;
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, mode);
  feedViewStore.set(mode);
}

// Detection sets the starting view only while the operator has not chosen: the
// live feed when a stream answers, the HUD when it does not.
export function reportFeedAvailability(available: boolean): void {
  feedAvailableStore.set(available);
  if (userChose) return;
  feedViewStore.set(available ? 'feed' : 'hud');
}
