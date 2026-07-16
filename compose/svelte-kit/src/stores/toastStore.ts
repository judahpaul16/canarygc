import { writable } from 'svelte/store';
import type { NotificationType } from '../lib/overlays';

export interface Toast {
  id: number;
  title: string;
  content: string;
  type: NotificationType;
  // Milliseconds before auto-dismiss; 0 means the toast stays until closed.
  duration: number;
  persistent: boolean;
  // Runs when the toast is dismissed, by the close button or the caller.
  onDismiss?: () => void;
  // Rendered as a trusted anchor below the content; the caller sets the href.
  link?: { href: string; label: string };
}

// At most this many toasts stack at once; the oldest auto-dismissing one is
// evicted when a new toast would exceed the cap so the corner never floods.
const MAX_TOASTS = 4;

export const toastStore = writable<Toast[]>([]);

let nextId = 1;

export function pushToast(toast: Omit<Toast, 'id'>): number {
  const id = nextId++;
  toastStore.update((list) => {
    const next = [...list, { ...toast, id }];
    while (next.length > MAX_TOASTS) {
      const idx = next.findIndex((t) => !t.persistent);
      if (idx === -1) break;
      next.splice(idx, 1);
    }
    return next;
  });
  return id;
}

export function dismissToast(id: number): void {
  toastStore.update((list) => {
    const toast = list.find((t) => t.id === id);
    if (toast?.onDismiss) {
      try {
        toast.onDismiss();
      } catch {
        // A dismissal hook must never block removing the toast.
      }
    }
    return list.filter((t) => t.id !== id);
  });
}
