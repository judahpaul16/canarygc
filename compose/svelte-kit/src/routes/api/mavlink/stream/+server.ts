import type { RequestHandler } from '@sveltejs/kit';
import { subscribeTelemetry, mavlinkConfigured, latestHeartbeat } from '$lib/server/mavlink';
import { operatorStreamOpened, operatorStreamClosed } from '$lib/server/operator-failsafe';
import {
    ENVELOPE_DISABLED,
    ENVELOPE_KEEPALIVE,
    encodeFrameEnvelope,
    encodeLineEnvelope,
    encodeMarkerEnvelope
} from '$lib/telemetry-envelope';

// Binary telemetry stream. Each vehicle message travels as its raw MAVLink
// wire frame inside a small envelope and the browser decodes it, which costs
// a tenth of the bytes of the text lines it replaces. Station events ride the
// same stream as text envelopes. The hooks gate already rejects an
// unauthenticated caller with 401, so no session check is needed here.
export const GET: RequestHandler = async () => {
    let unsubscribe: (() => void) | null = null;
    let keepalive: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
        start(controller) {
            // Each open telemetry stream marks an operator as present; the
            // lost-operator failsafe watches for the last one closing.
            operatorStreamOpened();
            const send = (bytes: Uint8Array) => {
                try {
                    controller.enqueue(bytes);
                } catch {
                    // Consumer went away between the check and the enqueue.
                }
            };

            if (!mavlinkConfigured()) {
                // No MAVLink vehicle (an MSP flight controller): the client
                // falls back to its MSP telemetry poll.
                send(encodeMarkerEnvelope(ENVELOPE_DISABLED));
            } else {
                const heartbeat = latestHeartbeat();
                if (heartbeat) send(encodeLineEnvelope(Date.now(), heartbeat));
            }

            unsubscribe = subscribeTelemetry({
                onFrame: (tsMs, frame) => send(encodeFrameEnvelope(tsMs, frame)),
                onLine: (tsMs, line) => send(encodeLineEnvelope(tsMs, line))
            });
            keepalive = setInterval(() => {
                send(encodeMarkerEnvelope(ENVELOPE_KEEPALIVE));
            }, 15000);
        },
        cancel() {
            operatorStreamClosed();
            unsubscribe?.();
            if (keepalive) clearInterval(keepalive);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store, no-transform',
            Connection: 'keep-alive'
        }
    });
};
