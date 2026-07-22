import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { Building } from '$lib/hazards';
import { etagJson } from '$lib/server/geocache';
import { buildingsForBbox } from '$lib/server/overlays';

// Building footprints and heights for path planning, from OpenStreetMap via the
// Overpass API. The FAA obstacle file only lists registered tall structures
// (towers, stacks), so ordinary buildings come from OSM. The bounding box is
// minLon,minLat,maxLon,maxLat.
export const GET: RequestHandler = async ({ url, request }) => {
  const bbox = url.searchParams.get('bbox');
  if (!bbox) return json({ buildings: [] as Building[] });

  try {
    return etagJson(request, { buildings: await buildingsForBbox(bbox) });
  } catch (error) {
    console.error('Overpass buildings fetch failed:', error);
    return json({ buildings: [] as Building[], error: (error as Error).message });
  }
};
