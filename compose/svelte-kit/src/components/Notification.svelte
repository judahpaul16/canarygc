<script lang="ts">
  import { onMount } from 'svelte';
  import { notificationCountStore } from '../stores/notificationCountStore';
  import { get } from 'svelte/store';

  interface Props {
    id?: number;
    title: string;
    content: string;
    type?: string;
  }

  let {
    id = get(notificationCountStore),
    title,
    content,
    type = 'info'
  }: Props = $props();

  const RESTACK_INTERVAL_MS = 1000;
  const STACK_GAP_PX = 8;

  // Escapes markup, then restores line breaks so notification text can never
  // inject live HTML (MAVLink STATUSTEXT is attacker-influenced input).
  function renderSafe(raw: string): string {
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return escaped.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  }

  const safeContent = $derived(renderSafe(content));

  const close = () => {
    document.getElementById(`notification-${id}`)?.remove();
    updateTranslateY();
  };

  const updateTranslateY = () => {
    const notifications = Array.from(document.querySelectorAll('.notification'));
    notificationCountStore.set(notifications.length);
    if (notifications.length === 0) return;
    const notificationHeight = notifications[notifications.length - 1].clientHeight + STACK_GAP_PX;

    notifications.forEach((notif, index) => {
      (notif as HTMLElement).style.transform = `translateY(${index * notificationHeight}px)`;
    });
  };

  onMount(() => {
    updateTranslateY();
    const interval = setInterval(updateTranslateY, RESTACK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      setTimeout(updateTranslateY, 0);
    };
  });
</script>

<div class="notification notification-{type} fixed top-4 right-4 z-50 rounded-lg" id="notification-{id}">
    <div class="shadow-lg max-w-sm w-full rounded-lg">
        <div class="relative rounded-2xl">
            <div class="px-4 py-2 text-lg font-semibold rounded-2xl text-center">
                {title}
            </div>
            <button onclick={close} class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl">
                &times;
            </button>
        </div>
        <hr class="border-[#ffffff7c] w-[80%] m-auto rounded-lg" />
        <div class="px-4 py-2 rounded-2xl text-center">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- safeContent is escaped above; only <br> survives -->
            {@html safeContent}
        </div>
    </div>
</div>

<style>
    .relative {
        border-color: var(--secondaryColor);
    }
    .notification-info div {
        background-color: #2a7acf;
        color: #c9d5f3;
    }
    .notification-success div {
        background-color: #1e8d1e;
        color: #affcaf;
    }
    .notification-warning div {
        background-color: #d48c3a;
        color: #f7d08a;
    }
    .notification-error div {
        background-color: #d62929;
        color: #f7d4d4;
    }
</style>
