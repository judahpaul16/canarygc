import { SerialPort } from 'serialport';
import { connect } from 'net';
import { MavLinkPacketSplitter, MavLinkPacketParser, type MavLinkPacketRegistry, type MavLinkPacket, minimal, common, ardupilotmega, MavLinkProtocolV2, send } from 'node-mavlink';
import type { RequestHandler } from '@sveltejs/kit';

let logs: string[] = [];

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

export const POST: RequestHandler = async (request) => {
    // Use UART serial port in production
    // const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 });
    
    // Uncomment for development
    const port = connect({ host: 'sitl', port: 5760 });

    const reader = port
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    let streamClosed = false;
  
    const stream = new ReadableStream({
        async start(controller) {
            // Sending a command
            if (request.params.command) {
                let command = request.params.command;
                let command2Send: any = new common.CommandLong();
                command2Send.command = common.MavCmd[command as keyof typeof common.MavCmd];
                command2Send.target_system = 1;
                await send(port, command2Send, new MavLinkProtocolV2());
            }

            reader.on('data', (packet: MavLinkPacket) => {
                if (!streamClosed) {
                    const clazz = REGISTRY[packet.header.msgid];
                    if (clazz) {
                        const data = packet.protocol.data(packet.payload, clazz);
                        const sanitizedData = convertBigIntToNumber(data);
                        let timestamp = new Date().toISOString();
                        controller.enqueue(`${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(sanitizedData as ParamValueData)}\n`);
                    }
                }
            });

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
