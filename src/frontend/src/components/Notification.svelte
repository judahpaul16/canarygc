<svelte:options accessors={true} />
<script lang="ts">
    import { onMount, afterUpdate } from 'svelte';
    import { notificationCountStore } from '../stores/notificationCountStore';
    import { get } from 'svelte/store';

    export let id: number = get(notificationCountStore);
    export let title: string;
    export let content: string;
    export let type: string = 'info';

    let translateY: string = '0px';

    const close = () => {
        document.getElementById(`notification-${id}`)?.remove();
        updateTranslateY();
    };

    const updateTranslateY = () => {
        const notifications = Array.from(document.querySelectorAll('.notification'));
        notificationCountStore.set(notifications.length);
        const notificationHeight = notifications[notifications.length - 1].clientHeight + 8;

        notifications.forEach((notif, index) => {
            // @ts-ignore
            notif.style.transform = `translateY(${index * notificationHeight}px)`;
        });
        translateY = `translateY(${notifications.findIndex(n => n.id === `notification-${id}`) * notificationHeight}px)`;
    };

    onMount(() => {
        setInterval(() => {
            updateTranslateY();
        }, 1000);
    });

    afterUpdate(() => {
        updateTranslateY();
    });
</script>

<div class="notification notification-{type} fixed top-4 right-4 z-50 rounded-lg" id="notification-{id}">
    <div class="shadow-lg max-w-sm w-full rounded-lg">
        <div class="relative border-[#2d2d2d] rounded-[1.5em]">
            <div class="px-4 py-2 text-lg font-semibold text-white rounded-[1.5em] text-center">
                {title}
            </div>
            <button on:click={close} class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl">
                &times;
            </button>
        </div>
        <hr class="border-[#ffffff7c] w-[80%] m-auto rounded" />
        <div class="px-4 py-2 text-white rounded-[1.5em] text-center">
            {@html content}
        </div>
    </div>
</div>

<style>
    .notification-info div {
        background-color: #2b6cb0;
        color: #c9d5f3;
    }
    .notification-success div {
        background-color: #146e14;
        color: #affcaf;
    }
    .notification-warning div {
        background-color: #d97706;
        color: #f7d08a;
    }
    .notification-error div {
        background-color: #b91c1c;
        color: #f7d4d4;
    }
</style>
