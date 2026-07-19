import { writable } from 'svelte/store';
import { sessionBool } from '../lib/session-persisted';

export interface TrafficContact {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altM: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  onGround: boolean;
  source: 'vehicle' | 'network';
  seenAt: number;
}

const CONTACT_STALE_MS = 15_000;

export const showTrafficStore = sessionBool('map.showTraffic', false);
export const trafficStore = writable<Record<string, TrafficContact>>({});

export function upsertTraffic(contacts: TrafficContact[]) {
  trafficStore.update((current) => {
    const next: Record<string, TrafficContact> = {};
    const cutoff = Date.now() - CONTACT_STALE_MS;
    for (const c of Object.values(current)) if (c.seenAt >= cutoff) next[c.id] = c;
    for (const c of contacts) next[c.id] = c;
    return next;
  });
}
