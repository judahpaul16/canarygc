import type { RequestHandler } from '@sveltejs/kit';
import { answerTelemetryOffer } from '$lib/server/rtc-telemetry';

// Signaling for the unreliable telemetry DataChannel. The browser posts its SDP
// offer and gets the answer back; ICE candidates ride inside the SDP, so one
// request completes the handshake. The hooks gate already rejects an
// unauthenticated caller with 401.
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    if (typeof body.sdp !== 'string') {
        return new Response('Expected an SDP offer', { status: 400 });
    }
    try {
        const sdp = await answerTelemetryOffer(body.sdp);
        return new Response(JSON.stringify({ sdp }), {
            headers: { 'content-type': 'application/json' }
        });
    } catch (error) {
        console.error('RTC telemetry offer failed:', (error as Error).message);
        return new Response('Failed to negotiate the telemetry channel', { status: 502 });
    }
};
