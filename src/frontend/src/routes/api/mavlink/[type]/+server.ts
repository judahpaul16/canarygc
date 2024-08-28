import type { RequestHandler } from '@sveltejs/kit';
import {
    initializePort,
    requestSysStatus,
    sendMavlinkCommand,
    loadMissionItem,
    clearAllMissions,
    online,
    statusRequested,
    logs,
    newLogs
} from '$lib/server/mavlink';

let previousLogLength = 0;

export const POST: RequestHandler = async (request): Promise<Response> => {
    switch (request.params.type) {
        case 'init':
            try {
                if (!online) await initializePort();
                if (online && !statusRequested) await requestSysStatus();

                // Return new logs and clear newLogs
                const currentLogLength = logs.length;
                if (logs.length > 0) {
                    const logsToSend = newLogs.slice();
                    newLogs.length = 0; // Clear newLogs
                    previousLogLength = currentLogLength; // Update previous length
                    return new Response(JSON.stringify(logsToSend), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }

                return new Response('No logs available', { status: 503 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'send_command':
            let command = request.request.headers.get('command');
            let params: string | number[] | null = request.request.headers.get('params');
            let useArduPilotMega = request.request.headers.get('useArduPilotMega') === 'true';
            if (params) params = params.split(',').map((param) => {
                return parseInt(param);
            });
            try {
                if (command) {
                    if (params === null) params = [];
                    await sendMavlinkCommand(command, params as number[], useArduPilotMega);
                    console.log(`MAVLink Command sent: ${command}, params: [${params}]`);
                    return new Response(`MAVLink Command sent: ${command}, params: [${params}]`, { status: 200 });
                } else {
                    return new Response('Command not provided', { status: 400 });
                }
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'clear_missions':
            try {
                await clearAllMissions();
                console.log(`MAVLink missions cleared`);
                return new Response('MAVLink missions cleared', { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'load_mission':
            try {
                Object.entries(JSON.parse(request.request.headers.get('actions')!)).forEach(async ([key, val]) => {
                    await loadMissionItem(val,  parseInt(key));
                    console.log(`Mission item ${parseInt(key) - 1} loaded: ${JSON.stringify(val)}`);
                    return new Response('MAVLink mission loaded', { status: 200 });
                });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        default:
            return new Response(`Invalid request type: ${request.params.type}`, { status: 400 });
    };
};