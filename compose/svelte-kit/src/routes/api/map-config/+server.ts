import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getSetting } from '$lib/server/settings';
import { resolveTiles } from '$lib/tiles';

// Resolved basemap tile URLs for the client map. The MapTiler key is a public
// tile key (it travels in the tile URLs), so it is fine to hand to the
// authenticated client.
export const GET: RequestHandler = async () => {
  const config = {
    maptilerKey: (await getSetting('integration.maptiler')) || process.env.MAPTILER_KEY || undefined,
    lightUrl: (await getSetting('tiles.light')) || undefined,
    darkUrl: (await getSetting('tiles.dark')) || undefined,
    satelliteUrl: (await getSetting('tiles.satellite')) || undefined
  };
  return json({ ...resolveTiles(config), maptilerKey: config.maptilerKey ?? '' });
};
