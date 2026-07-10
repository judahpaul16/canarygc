import type { RequestHandler } from '@sveltejs/kit';
import type { AirspaceZone } from '$lib/safety';

// Fetches nearby airspace from OpenAIP (https://www.openaip.net, a free
// worldwide aeronautical database) and returns simplified zones the map overlay
// and safety checks consume. The API key is server-side only. Without a key or
// on any upstream failure this returns an empty list so the app degrades to
// "no airspace data" rather than blocking flight planning.

const OPENAIP_URL = 'https://api.core.openaip.net/api/airspaces';
const RESTRICTED_KEYWORDS = ['PROHIBITED', 'RESTRICTED', 'DANGER', 'NO_FLY', 'NOFLY', 'TRA', 'TSA'];

interface OpenAipFeature {
  name?: string;
  type?: number | string;
  icaoClass?: number | string;
  geometry?: { type?: string; coordinates?: number[][][] };
}

function isRestricted(feature: OpenAipFeature): boolean {
  const label = `${feature.type ?? ''} ${feature.icaoClass ?? ''} ${feature.name ?? ''}`.toUpperCase();
  return RESTRICTED_KEYWORDS.some((kw) => label.includes(kw));
}

export const GET: RequestHandler = async ({ url }) => {
  const apiKey = process.env.OPENAIP_API_KEY;
  const bbox = url.searchParams.get('bbox'); // minLon,minLat,maxLon,maxLat

  if (!apiKey || !bbox) {
    return new Response(JSON.stringify({ zones: [] as AirspaceZone[], configured: Boolean(apiKey) }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const query = new URLSearchParams({ bbox, limit: '500' });
    const response = await fetch(`${OPENAIP_URL}?${query}`, {
      headers: { 'x-openaip-api-key': apiKey }
    });
    if (!response.ok) throw new Error(`OpenAIP responded ${response.status}`);
    const data = await response.json();
    const features: OpenAipFeature[] = Array.isArray(data?.items) ? data.items : [];

    const zones: AirspaceZone[] = features
      .filter((f) => f.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates))
      .map((f) => ({
        name: f.name ?? 'Airspace',
        restricted: isRestricted(f),
        polygon: f.geometry!.coordinates as number[][][]
      }));

    return new Response(JSON.stringify({ zones, configured: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Airspace fetch failed:', error);
    return new Response(JSON.stringify({ zones: [] as AirspaceZone[], configured: true, error: (error as Error).message }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
};
