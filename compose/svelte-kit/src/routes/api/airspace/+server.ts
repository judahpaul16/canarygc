import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { AirspaceZone } from '$lib/safety';
import { getSetting } from '$lib/server/settings';
import { airspaceForBbox } from '$lib/server/overlays';

// Airspace for the map overlay and safety checks. OpenAIP is worldwide but
// needs a key; when the key is unset or OpenAIP returns nothing, this falls back
// to the FAA's public airspace layers, which are keyless and cover the US. The
// bounding box is minLon,minLat,maxLon,maxLat, which serves both providers.
export const GET: RequestHandler = async ({ url }) => {
  const bbox = url.searchParams.get('bbox');
  if (!bbox) {
    const apiKey = (await getSetting('integration.openaip')) || process.env.OPENAIP_API_KEY;
    return json({ zones: [] as AirspaceZone[], source: 'none', configured: Boolean(apiKey) });
  }
  return json(await airspaceForBbox(bbox));
};
