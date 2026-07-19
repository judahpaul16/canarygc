import { mount, unmount } from 'svelte';
import Modal from '../components/Modal.svelte';
import ToastHost from '../components/ToastHost.svelte';
import { pushToast, dismissToast } from '../stores/toastStore';
import { m } from '$lib/paraglide/messages';

export interface ModalInput {
  type: string;
  placeholder: string;
  required: boolean;
  // Shown above the field; the placeholder becomes a short example hint. A
  // labeled field stays identified when filled and never truncates.
  label?: string;
  // Initial value; a select confirms with this when left untouched.
  value?: string;
  options?: { value: string; label: string }[];
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
  // Toasts sharing a key never stack a duplicate.
  key?: string;
  title: string;
  content: string;
  type?: NotificationType;
  duration?: number;
  // A persistent toast has no auto-dismiss timer; the caller holds the
  // returned close() and calls it when the action it narrates completes.
  persistent?: boolean;
  // Runs when the toast is dismissed, by the close button or the caller.
  onDismiss?: () => void;
  // Rendered as a trusted anchor below the content; the caller sets the href.
  link?: { href: string; label: string };
  // A button below the content that runs an in-app action.
  action?: { label: string; onClick: () => void };
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
      confirmLabel: options.confirmLabel ?? m.common_confirm(),
      cancelLabel: options.cancelLabel ?? m.common_cancel(),
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
    key: options.key,
    title: options.title,
    content: options.content,
    type: options.type ?? 'info',
    duration,
    persistent,
    onDismiss: options.onDismiss,
    link: options.link,
    action: options.action
  });
  return () => dismissToast(id);
}
