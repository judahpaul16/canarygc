/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

const self = globalThis as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;

const ASSETS = [...build, ...files];

// The root HTML is the navigation fallback, so a cold offline start can boot
// the shell and let the client router take over from the precached chunks.
const SHELL = '/';

self.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
		await cache.add(SHELL);
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
		// Control the first session too, so pages fetched from here on land in
		// the runtime cache instead of waiting for the next visit.
		await self.clients.claim();
	}

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	// DevTools issues only-if-cached requests outside same-origin mode, which
	// fetch() rejects inside a worker (a Chromium quirk), so those pass through.
	if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;

	const url = new URL(event.request.url);

	// Live data stays live: telemetry, overlays, and video signaling never
	// come from or go into the cache. Cross-origin traffic (map tiles,
	// terrain) keeps its own HTTP caching.
	if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

	async function respond() {
		const cache = await caches.open(CACHE);

		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(url.pathname);
			if (response) return response;
		}

		try {
			const response = await fetch(event.request);

			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}

			if (response.status === 200 && !response.headers.get('cache-control')?.includes('no-store')) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch {
			const response = await cache.match(event.request);
			if (response) return response;
			if (event.request.mode === 'navigate') {
				const shell = await cache.match(SHELL);
				if (shell) return shell;
			}
			return Response.error();
		}
	}

	event.respondWith(respond());
});
