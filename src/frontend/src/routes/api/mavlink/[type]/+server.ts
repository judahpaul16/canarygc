import type { RequestHandler } from '@sveltejs/kit';
import { initializePort, requestGpsData, sendMavlinkCommand, online, gpsRequested, logs } from '$lib/server/mavlink';

export const POST: RequestHandler = async (request): Promise<Response> => {
    switch (request.params.type) {
        case 'init':
            try {
                if (!online)await initializePort();
                if (online && !gpsRequested) await requestGpsData();
                return new Response(JSON.stringify(logs.pop()), { status: 200, headers: { 'Content-Type': 'application/json' } });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'send_command':
            let command = request.request.headers.get('command');
            try {
                if (command) {
                    await sendMavlinkCommand(command);
                    console.log(`MAVLink Command sent: ${command}`);
                    return new Response('Command sent', { status: 200 });
                } else {
                    return new Response('Command not provided', { status: 400 });
                }
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        default:
            return new Response(`Invalid request type: ${request.params.type}`, { status: 400 });
    };
};