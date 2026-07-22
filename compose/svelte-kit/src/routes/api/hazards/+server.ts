import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { CeilingCell, Obstacle } from '$lib/hazards';
import { etagJson } from '$lib/server/geocache';
import { hazardsForBbox } from '$lib/server/overlays';

// Flight hazards for the map overlays and safety checks, from the FAA's keyless
// public layers (US): the UAS Facility Map LAANC ceiling grid and the Digital
// Obstacle File. The bounding box is minLon,minLat,maxLon,maxLat.
export const GET: RequestHandler = async ({ url, request }) => {
  const bbox = url.searchParams.get('bbox');
  if (!bbox) {
    return json({ ceilings: [] as CeilingCell[], obstacles: [] as Obstacle[], obstaclesTruncated: false });
  }
  return etagJson(request, await hazardsForBbox(bbox));
};
