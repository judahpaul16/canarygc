import type { RequestHandler } from '@sveltejs/kit';
import {
    port,
    reader,
    online,
    connecting,
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
                let connected = (port && reader && online);
                if (!connected) await initializePort();
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
        case 'send_command':
            let command = event.request.headers.get('command');
            let params: string | number[] | null = event.request.headers.get('params');
            let useArduPilotMega = event.request.headers.get('useArduPilotMega');
            let useCmdLong = event.request.headers.get('useCmdLong');
            if (useCmdLong === null) useCmdLong = 'false';
            if (useArduPilotMega === null) useArduPilotMega = 'false';
            if (params) params = params.split(',').map((param) => {
                return parseFloat(param);
            });
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
        case 'clear_mission':
            try {
                await clearAllMissionItems();
                console.log(`MAVLink missions cleared`);
                return new Response('MAVLink missions cleared', { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'load_mission':
            let actions = event.request.headers.get('actions');
            try {
                if (actions) {
                    await setMissionCount(Object.keys(JSON.parse(actions)).length);
                    Object.entries(JSON.parse(actions)).forEach(async ([key, val]) => {
                        await new Promise((resolve) => setTimeout(resolve, 250)); // Wait for 250 ms
                        await loadMissionItem(val,  parseInt(key));
                    });
                    return new Response('MAVLink mission loaded', { status: 200 });
                }
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'set_position_local':
            let x: number = parseInt(event.request.headers.get('x')!);
            let y: number = parseInt(event.request.headers.get('y')!);
            let z: number = parseInt(event.request.headers.get('z')!);
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
        case 'request_params':
            try {
                await requestParameters();
                return new Response('Parameters requested', { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'write_param':
            let id = event.request.headers.get('id')!;
            let value = parseFloat(event.request.headers.get('value')!);
            let type = parseInt(event.request.headers.get('type')!);
            if (isNaN(value) || isNaN(type)) {
                return new Response('Invalid value or type', { status: 400 });
            }
            try {
                // Null-terminate `id` if it's less than 16 characters
                // https://mavlink.io/en/services/parameter.html#parameter-names
                let processedId = id.padEnd(16, '\0');
                await writeParameter(processedId, value, type);
                console.log(`Parameter written: ${processedId}, value: ${value}, type: ${type}`);
                return new Response(`Parameter written: ${processedId}, value: ${value}, type: ${type}`, { status: 200 });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        default:
            return new Response(`Invalid request type: ${event.params.type}`, { status: 400 });
    };
};