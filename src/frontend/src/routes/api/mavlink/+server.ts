import { SerialPort } from 'serialport';
import { connect } from 'net';
import { MavLinkPacketSplitter, MavLinkPacketParser, type MavLinkPacketRegistry, type MavLinkPacket, minimal, common, ardupilotmega } from 'node-mavlink';
import type { RequestHandler } from '@sveltejs/kit';

let logs : string[] = [];

const REGISTRY: MavLinkPacketRegistry = {
    ...minimal.REGISTRY,
    ...common.REGISTRY,
    ...ardupilotmega.REGISTRY,
  }

export const POST: RequestHandler = async () => {
    // Use UART serial port in production
    // const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 });
    
    // Uncomment for development
    const port = connect({ host: 'sitl', port: 5760 });

    const reader = port
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    let streamClosed = false;
    
    const stream = new ReadableStream({
        start(controller) {
            reader.on('data', (packet: MavLinkPacket) => {
                if (!streamClosed) {
                    // Push the packet data to the stream
                    const clazz = REGISTRY[packet.header.msgid]
                    if (clazz) {
                        const data = packet.protocol.data(packet.payload, clazz)
                        const sanitizedData = convertBigIntToNumber(data);
                        controller.enqueue(`${clazz.MSG_NAME}: ${JSON.stringify(sanitizedData)}\n`);
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
