import { mount, unmount } from 'svelte';
import ServoActions from '../components/ServoActions.svelte';
import { overlayTarget } from './overlays';

export function showServoActions(): () => void {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    unmount(instance);
  };
  const instance = mount(ServoActions, {
    target: overlayTarget(),
    props: { onClose: close }
  });
  return close;
}
