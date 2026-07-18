import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'localStorage', 'baseLocale'],
			emitTsDeclarations: true
		}),
		sveltekit()
	],
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
