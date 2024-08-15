import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import { MavLinkPacketSplitter, MavLinkPacketParser, type MavLinkPacketRegistry, type MavLinkPacket, minimal, common, ardupilotmega, waitFor, MavLinkProtocolV2, send } from 'node-mavlink';
import type { RequestHandler } from '@sveltejs/kit';

const REGISTRY: MavLinkPacketRegistry = {
    ...minimal.REGISTRY,
    ...common.REGISTRY,
    ...ardupilotmega.REGISTRY,
};

interface HeartBeatData {
    type: number;
    autopilot: number;
    baseMode: number;
    customMode: number;
    systemStatus: number;
    mavlinkVersion: number;
}

interface ParamValueData {
    paramId: string;
    paramValue: string;
    paramType: number;
    paramCount: number;
    paramIndex: number;
}

async function requestGpsData(port: SerialPort | Socket, reader: MavLinkPacketParser) {
    // Create a REQUEST_DATA_STREAM message
    const request = new common.SetMessageIntervalCommand;
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GpsRawInt.MSG_ID;
    request.interval = 1000000; // 1 Hz
    request.responseTarget = 1;
    await send(port, request);
}

async function requestParameters(port: SerialPort | Socket, reader: MavLinkPacketParser) {
    // Create a PARAM_REQUEST_LIST message
    const request = new common.ParamRequestList()
    request.targetSystem = 1
    request.targetComponent = 1
    await send(port, request);
}

async function sendMavlinkCommand(port: SerialPort | Socket, reader: MavLinkPacketParser, command: string) {
    // Create a COMMAND_LONG message
    let commandMsg = new common.CommandLong()
    commandMsg.targetSystem = 1
    commandMsg.targetComponent = 1
    commandMsg.command = common.MavCmd[command as keyof typeof common.MavCmd]
    commandMsg._param1 = 1
    commandMsg._param2 = 0
    commandMsg._param3 = 0
    commandMsg._param4 = 0
    commandMsg._param5 = 0
    commandMsg._param6 = 0
    commandMsg._param7 = 0
    await send(port, commandMsg);
}

export const POST: RequestHandler = async (request): Promise<Response> => {
    // Use UART serial port in production
    // const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 });
    
    // Uncomment for development
    const port = connect({ host: 'sitl', port: 5760 });
    
    try {
        await new Promise((resolve, reject) => {
            port.on('error', (err) => {
                console.error(`Error connecting to the MAVLink server: ${err.message}`);
                reject(new Response(`Error connecting to the MAVLink server: ${err.message}`, { status: 500 }));
            });
            port.on('open', () => {
                return resolve({ status: 200});
            });
        });
    } catch (err) {
        return err as Response;
    }

    const reader = port
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    let streamClosed = false;

    // A flag that determines if the remote system is alive
    let online = false;
    
    const stream = new ReadableStream({
        async start(controller) {
            reader.on('data', (packet: MavLinkPacket) => {
                if (!streamClosed) {
                    online = true
                    const clazz = REGISTRY[packet.header.msgid];
                    if (clazz) {
                        const data = packet.protocol.data(packet.payload, clazz);
                        const sanitizedData = convertBigIntToNumber(data);
                        let timestamp = new Date().toISOString();
                        controller.enqueue(`${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(sanitizedData as ParamValueData)}\n`);
                    }
                }
            }); 
            
            await waitFor(() => online)
            
            requestGpsData(port, reader);

            reader.on('end', () => {
                if (!streamClosed) {
                    controller.close();
                }
            });

            reader.on('error', (err: Error) => {
                if (!streamClosed) {
                    controller.error(err);
                }
            });
        },
        cancel() {
            streamClosed = true;
            reader.removeAllListeners();
            port.end(); // Close the port connection
        }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain' } });
};

function convertBigIntToNumber(obj: any): any {
    if (typeof obj === 'bigint') {
        return Number(obj);
    } else if (Array.isArray(obj)) {
        return obj.map(convertBigIntToNumber);
    } else if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, convertBigIntToNumber(value)])
        );
    } else {
        return obj;
    }
}
