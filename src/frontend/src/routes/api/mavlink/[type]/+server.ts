import type { RequestHandler } from '@sveltejs/kit';
import {
    port,
    reader,
    online,
    connecting,
    initializePort,
    requestSysStatus,
    sendMavlinkCommand,
    setMissionCount,
    loadMissionItem,
    clearAllMissionItems,
    setPositionLocal,
    newLogs,
    logs
} from '$lib/server/mavlink';

export const POST: RequestHandler = async (request): Promise<Response> => {
    switch (request.params.type) {
        case 'init':
            try {
                let connected = (port && reader && online);
                if (!connected && !connecting) await initializePort();
                else await requestSysStatus();

                if (logs.length > 0) {
                    const logsToSend = newLogs.slice();
                    newLogs.length = 0; // Clear newLogs
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
            let useArduPilotMega = request.request.headers.get('useArduPilotMega');
            let useCmdLong = request.request.headers.get('useCmdLong');
            if (useCmdLong === null) useCmdLong = 'true';
            if (params) params = params.split(',').map((param) => {
                return parseFloat(param);
            });
            try {
                if (command) {
                    if (params === null) params = [];
                    await sendMavlinkCommand(command, params as number[], useArduPilotMega === 'true', useCmdLong === 'true');
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
            let actions = request.request.headers.get('actions');
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
            let x: number = parseInt(request.request.headers.get('x')!);
            let y: number = parseInt(request.request.headers.get('y')!);
            let z: number = parseInt(request.request.headers.get('z')!);
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
        default:
            return new Response(`Invalid request type: ${request.params.type}`, { status: 400 });
    };
};