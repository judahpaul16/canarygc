<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { notificationCountStore } from '../stores/notificationCountStore';
	import { get } from 'svelte/store';

	let { title, content, type = 'info' } = $props<{
		id: number;
		title: string;
		content: string;
		type: string;
	}>();
	let id = $state(get(notificationCountStore));

	let translateY = $state('0px');
	let interval: NodeJS.Timeout;

	function close() {
		document.getElementById(`notification-${id}`)?.remove();
		updateTranslateY();
	}

	function updateTranslateY() {
		const notifications = Array.from(document.querySelectorAll('.notification'));
		notificationCountStore.set(notifications.length);
		const notificationHeight =
			(notifications[notifications.length - 1] as HTMLElement).clientHeight + 8;

		notifications.forEach((notif, index) => {
			(notif as HTMLElement).style.transform = `translateY(${index * notificationHeight}px)`;
		});
		translateY = `translateY(${
			notifications.findIndex((n) => n.id === `notification-${id}`) * notificationHeight
		}px)`;
	}

	onMount(() => {
		interval = setInterval(() => {
			updateTranslateY();
		}, 1000);
		// Because effects run after state updates, and `updateTranslateY` reads the DOM,
		// we need to run it in an effect to ensure it runs after the DOM updates.
		// We could also use `$effect.pre` to run it before the DOM updates,
		// but in this case it's simpler to use an effect.
		$effect(() => {
			updateTranslateY();
		});
	});

	onDestroy(() => {
		clearInterval(interval);
	});
</script>

<div
	class="notification notification-{type} fixed top-4 right-4 z-50 rounded-lg"
	id="notification-{id}"
	style:transform={translateY}
>
	<div class="shadow-lg max-w-sm w-full rounded-lg">
		<div class="relative rounded-[1.5em]">
			<div class="px-4 py-2 text-lg font-semibold rounded-[1.5em] text-center">
				{title}
			</div>
			<button onclick={close} class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl">
				×
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
