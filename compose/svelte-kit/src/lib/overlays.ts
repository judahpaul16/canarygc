import { mount, unmount } from 'svelte';
import Modal from '../components/Modal.svelte';
import ToastHost from '../components/ToastHost.svelte';
import { pushToast, dismissToast } from '../stores/toastStore';

export interface ModalInput {
  type: string;
  placeholder: string;
  required: boolean;
  // Shown above the field; the placeholder becomes a short example hint. A
  // labelled field stays identified when filled and never truncates.
  label?: string;
}

export type NotificationType = 'success' | 'warning' | 'error' | 'info';

export interface ModalOptions {
  title: string;
  content: string;
  html?: boolean;
  confirmation?: boolean;
  notification?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  inputs?: ModalInput[] | null;
  onConfirm?: (values: string[]) => void | Promise<void>;
  onCancel?: (values: string[]) => void;
  onClose?: () => void;
}

export interface NotifyOptions {
  title: string;
  content: string;
  type?: NotificationType;
  duration?: number;
  // A persistent toast has no auto-dismiss timer; the caller holds the
  // returned close() and calls it when the action it narrates completes.
  persistent?: boolean;
}

const NOTIFY_DURATION_MS = 6_000;
const MIN_DURATION_MS = 5_000;

// The Fullscreen API renders only the fullscreen element's subtree, so
// overlays mount inside it while the map is fullscreen.
export function overlayTarget(): HTMLElement {
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}

export function showModal(options: ModalOptions): () => void {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    unmount(instance);
  };
  const instance = mount(Modal, {
    target: overlayTarget(),
    props: {
      title: options.title,
      content: options.content,
      html: options.html ?? false,
      isOpen: true,
      confirmation: options.confirmation ?? false,
      notification: options.notification ?? false,
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      inputs: options.inputs ?? null,
      onConfirm: async (values: string[]) => {
        await options.onConfirm?.(values);
      },
      onCancel: (values: string[]) => {
        options.onCancel?.(values);
      },
      onClose: () => {
        options.onClose?.();
        close();
      }
    }
  });
  return close;
}

// The toast host mounts once and stays; on fullscreen change it moves into the
// fullscreen element's subtree, the only part the Fullscreen API renders.
let toastHost: HTMLElement | null = null;

function ensureToastHost(): void {
  const target = overlayTarget();
  if (toastHost) {
    if (toastHost.parentElement !== target) target.appendChild(toastHost);
    return;
  }
  toastHost = document.createElement('div');
  target.appendChild(toastHost);
  mount(ToastHost, { target: toastHost });
  document.addEventListener('fullscreenchange', () => {
    if (toastHost) overlayTarget().appendChild(toastHost);
  });
}

export function notify(options: NotifyOptions): () => void {
  ensureToastHost();
  const persistent = options.persistent ?? false;
  const duration = persistent
    ? 0
    : Math.max(MIN_DURATION_MS, options.duration ?? NOTIFY_DURATION_MS);
  const id = pushToast({
    title: options.title,
    content: options.content,
    type: options.type ?? 'info',
    duration,
    persistent
  });
  return () => dismissToast(id);
}
