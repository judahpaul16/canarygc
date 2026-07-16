import type { RequestHandler } from '@sveltejs/kit';
import { subscribeLogs, mavlinkConfigured, latestHeartbeat } from '$lib/server/mavlink';
import { operatorStreamOpened, operatorStreamClosed } from '$lib/server/operator-failsafe';

// Server-Sent Events telemetry stream. Each MAVLink log line is pushed the
// instant it is parsed, so the client renders a fresh fix rather than draining
// a batch on the next poll. The hooks gate already rejects an unauthenticated
// caller with 401, so no session check is needed here.
export const GET: RequestHandler = async () => {
    let unsubscribe: (() => void) | null = null;
    let keepalive: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
        start(controller) {
            // Each open telemetry stream marks an operator as present; the
            // lost-operator failsafe watches for the last one closing.
            operatorStreamOpened();
            const encoder = new TextEncoder();
            const send = (obj: unknown) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                } catch {
                    // Consumer went away between the check and the enqueue.
                }
            };

            if (!mavlinkConfigured()) {
                // No MAVLink vehicle (an MSP flight controller): the client
                // falls back to its MSP telemetry poll.
                send({ disabled: true });
            } else {
                const heartbeat = latestHeartbeat();
                if (heartbeat) send({ log: heartbeat });
            }

            unsubscribe = subscribeLogs((line) => send({ log: line }));
            keepalive = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'));
                } catch {
                    // Stream closed; cancel() will clean up.
                }
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
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        }
    });
};
