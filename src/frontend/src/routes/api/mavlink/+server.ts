import type { RequestHandler } from '@sveltejs/kit';
import { initializePort, requestGpsData, online, gpsRequested, logs } from '$lib/server/mavlink';

export const POST: RequestHandler = async (request): Promise<Response> => {
    try {
        if (!online)await initializePort();
        if (online && !gpsRequested) await requestGpsData();
        return new Response(JSON.stringify(logs.pop()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
        console.error(err);
        return new Response(`Error: ${(err as Error).message}`, { status: 500 });
    }
};