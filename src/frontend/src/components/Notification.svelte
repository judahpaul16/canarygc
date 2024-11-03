<svelte:options runes={true} />
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { notificationCountStore } from '../stores/notificationCountStore';
    import { get } from 'svelte/store';
    
	
	interface NotificationProps {
        id: number;
        title: string;
        content: string;
        type?: string;
    }
	
	let { id = get(notificationCountStore), title, content, type = 'info' } = $props<NotificationProps>();
     
    
    let translateY: string = '0px';
    let interval: NodeJS.Timeout;

    const close = () => {
        document.getElementById(`notification-${id}`)?.remove();
        updateTranslateY();
    };

    const updateTranslateY = () => {
        const notifications = Array.from(document.querySelectorAll('.notification'));
        notificationCountStore.set(notifications.length);
        const notificationHeight = notifications[notifications.length - 1]?.clientHeight + 8 || 0;

        notifications.forEach((notif, index) => {
            notif.style.transform = `translateY(${index * notificationHeight}px)`;
        });
        translateY = `translateY(${notifications.findIndex(n => n.id === `notification-${id}`) * notificationHeight}px)`;
    };

    onMount(() => {
        interval = setInterval(updateTranslateY, 1000);
    });

    onDestroy(() => {
        clearInterval(interval);
    });

    // Replace afterUpdate with $effect
    $effect(() => {
        updateTranslateY();
    });
</script>

<div class="notification notification-{type} fixed top-4 right-4 z-50 rounded-lg" id="notification-{id}">
    <div class="shadow-lg max-w-sm w-full rounded-lg">
        <div class="relative rounded-[1.5em]">
            <div class="px-4 py-2 text-lg font-semibold rounded-[1.5em] text-center">
                {title}
            </div>
            <button on:click={close} class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl">
                &times;
            </button>
        </div>
        <hr class="border-[#ffffff7c] w-[80%] m-auto rounded" />
        <div class="px-4 py-2 rounded-[1.5em] text-center">
            {@html content}
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
