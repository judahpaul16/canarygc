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
  confirmation?: boolean;
  notification?: boolean;
  inputs?: ModalInput[] | null;
  onConfirm?: (values: string[]) => void | Promise<void>;
  onCancel?: () => void;
}

export interface NotifyOptions {
  title: string;
  content: string;
  type?: NotificationType;
  duration?: number;
}

const NOTIFY_DURATION_MS = 10_000;

export function showModal(options: ModalOptions): () => void {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    unmount(instance);
  };
  const instance = mount(Modal, {
    target: document.body,
    props: {
      title: options.title,
      content: options.content,
      isOpen: true,
      confirmation: options.confirmation ?? false,
      notification: options.notification ?? false,
      inputs: options.inputs ?? null,
      onConfirm: async (values: string[]) => {
        await options.onConfirm?.(values);
      },
      onCancel: () => {
        options.onCancel?.();
      },
      onClose: close
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
    target: document.body,
    props: {
      title: options.title,
      content: options.content,
      type: options.type ?? 'info'
    }
  });
  const timer = setTimeout(close, options.duration ?? NOTIFY_DURATION_MS);
  return close;
}
