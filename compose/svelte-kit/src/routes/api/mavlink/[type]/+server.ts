import type { RequestHandler } from '@sveltejs/kit';
import {
    linkAlive,
    initializePort,
    requestStatus,
    requestParameters,
    writeParameter,
    sendMavlinkCommand,
    setMissionCount,
    loadMissionItem,
    clearAllMissionItems,
    setPositionLocal,
    newLogs,
    logs
} from '$lib/server/mavlink';

export const POST: RequestHandler = async (event): Promise<Response> => {
    switch (event.params.type) {
        case 'heartbeat':
            try {
                const connected = linkAlive();
                // Connecting can take tens of seconds on a fresh autopilot
                // boot; the shared attempt runs in the background so the
                // heartbeat answers immediately with the current state.
                if (!connected) void initializePort().catch(() => {});
                else await requestStatus();

                if (logs.length > 0) {
                    const logsToSend = newLogs.slice();
                    newLogs.length = 0; // Clear newLogs
                    return new Response(JSON.stringify(logsToSend), { status: 200, headers: {
                        'Content-Type': 'application/json',
                        'isProduction': `${process.env.NODE_ENV === 'production'}`,
                    }});
                }

                return new Response('No logs available', { status: 503 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'send_command': {
            const command = event.request.headers.get('command');
            let params: string | number[] | null = event.request.headers.get('params');
            let useArduPilotMega = event.request.headers.get('useArduPilotMega');
            let useCmdLong = event.request.headers.get('useCmdLong');
            if (useCmdLong === null) useCmdLong = 'false';
            if (useArduPilotMega === null) useArduPilotMega = 'false';
            if (params) params = params.split(',').map((param) => parseFloat(param));
            try {
                if (command) {
                    if (params === null) params = [];
                    await sendMavlinkCommand(command, params as number[], useCmdLong === 'true', useArduPilotMega === 'true');
                    console.log(`MAVLink Command sent: ${command}, params: [${params}]`);
                    return new Response(`MAVLink Command sent: ${command}, params: [${params}]`, { status: 200 });
                } else {
                    return new Response('Command not provided', { status: 400 });
                }
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        }
        case 'clear_mission':
            try {
                await clearAllMissionItems();
                console.log(`MAVLink missions cleared`);
                return new Response('MAVLink missions cleared', { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'load_mission': {
            const actions = event.request.headers.get('actions');
            if (!actions) return new Response('Mission actions not provided', { status: 400 });
            try {
                const items = JSON.parse(actions) as import('$lib/server/mavlink').MissionItemInput[];
                await setMissionCount(items.length);
                for (let i = 0; i < items.length; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 250)); // Pace item uploads
                    await loadMissionItem(items[i], i);
                }
                return new Response('MAVLink mission loaded', { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        }
        case 'set_position_local': {
            const x: number = parseInt(event.request.headers.get('x')!);
            const y: number = parseInt(event.request.headers.get('y')!);
            const z: number = parseInt(event.request.headers.get('z')!);
            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                return new Response('Invalid coordinates', { status: 400 });
            }
            try {
                await setPositionLocal(x, y, z);
                return new Response(`Local position set manually: x: ${x}, y: ${y}, z: ${z}`, { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        }
        case 'request_params':
            try {
                await requestParameters();
                return new Response('Parameters requested', { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'write_param': {
            const id = event.request.headers.get('id')!;
            const value = parseFloat(event.request.headers.get('value')!);
            const type = parseInt(event.request.headers.get('type')!);
            if (isNaN(value) || isNaN(type)) {
                return new Response('Invalid value or type', { status: 400 });
            }
            try {
                // Null-terminate `id` if it's less than 16 characters
                // https://mavlink.io/en/services/parameter.html#parameter-names
                const processedId = id.padEnd(16, '\0');
                await writeParameter(processedId, value, type);
                console.log(`Parameter written: ${processedId}, value: ${value}, type: ${type}`);
                return new Response(`Parameter written: ${processedId}, value: ${value}, type: ${type}`, { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        }
        default:
            return new Response(`Invalid request type: ${event.params.type}`, { status: 400 });
    }
};
