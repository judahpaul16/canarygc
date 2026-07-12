import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
	  host: true,
	  port: 5173
	},
	// Prebundled up front so lazily visited pages never trigger a mid-session
	// re-optimization, which splits the module graph across cache versions.
	optimizeDeps: {
	  include: [
	    'mavlink-mappings/dist/lib/minimal',
	    'mavlink-mappings/dist/lib/common',
	    'mavlink-mappings/dist/lib/ardupilotmega',
	    'leaflet',
	    'maplibre-gl'
	  ]
	}
});
