import { mount, unmount } from 'svelte';
import Modal from '../components/Modal.svelte';
import Notification from '../components/Notification.svelte';

export interface ModalInput {
  type: string;
  placeholder: string;
  required: boolean;
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
}

const NOTIFY_DURATION_MS = 10_000;

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

export function notify(options: NotifyOptions): () => void {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    unmount(instance);
  };
  const instance = mount(Notification, {
    target: overlayTarget(),
    props: {
      title: options.title,
      content: options.content,
      type: options.type ?? 'info'
    }
  });
  const timer = setTimeout(close, options.duration ?? NOTIFY_DURATION_MS);
  return close;
}
