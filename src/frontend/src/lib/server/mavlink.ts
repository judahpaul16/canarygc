import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import {
    MavLinkPacketSplitter,
    MavLinkPacketParser,
    type MavLinkPacketRegistry,
    type MavLinkPacket,
    minimal,
    common,
    ardupilotmega,
    send
} from 'node-mavlink';

const REGISTRY: MavLinkPacketRegistry = {
    ...minimal.REGISTRY,
    ...common.REGISTRY,
    ...ardupilotmega.REGISTRY,
};

interface ParamValueData {
    paramId: string;
    paramValue: string;
    paramType: number;
    paramCount: number;
    paramIndex: number;
}

let port: SerialPort | Socket | null = null;
let reader: MavLinkPacketParser | null = null;
let online = false;
let statusRequested = false;
let logs: string[] = [];

async function initializePort(): Promise<void> {
    if (port) return; // Return if port is already initialized

    // Use UART serial port in production
    // port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 });

    // Uncomment for development
    port = connect({ host: 'sitl', port: 5760 });

    await new Promise<void>((resolve, reject) => {
        port!.on('error', (err) => {
            reject(new Error(`Error connecting to the MAVLink server: ${err.message}`));
        });
        port!.on('data', () => resolve());
    });

    reader = port
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    reader.on('data', (packet: MavLinkPacket) => {
        online = true;
        const clazz = REGISTRY[packet.header.msgid];
        if (clazz) {
            const data = packet.protocol.data(packet.payload, clazz);
            const sanitizedData = convertBigIntToNumber(data);
            let timestamp = new Date().toISOString();
            let logEntry = `${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(sanitizedData as ParamValueData)}`;
            logs.push(logEntry); // Store log entries
            if (logs.length > 1000) {
                logs = logs.slice(-1000); // Limit logs to the latest 1000 entries
            }
        }
    });

    port.on('close', () => {
        port = null;
        reader = null;
    });
}

async function requestSysStatus() {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    let request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GpsRawInt.MSG_ID;
    request.interval = 1000000; // 1 Hz
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.SysStatus.MSG_ID;
    request.interval = 1000000; // 1 Hz
    request.responseTarget = 1;
    await send(port!, request);
    statusRequested = true;
}

async function requestParameters() {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const request = new common.ParamRequestList();
    request.targetSystem = 1;
    request.targetComponent = 1;
    await send(port!, request);
}

async function sendMavlinkCommand(command: string, params: any) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    let commandMsg = new common.CommandLong();
    commandMsg.targetSystem = 1;
    commandMsg.targetComponent = 1;
    commandMsg.command = common.MavCmd[command as keyof typeof common.MavCmd];
    commandMsg._param1 = params[1] || 0;
    commandMsg._param2 = params[2] || 0;
    commandMsg._param3 = params[3] || 0;
    commandMsg._param4 = params[4] || 0;
    commandMsg._param5 = params[5] || 0;
    commandMsg._param6 = params[6] || 0;
    commandMsg._param7 = params[7] || 0;
    await send(port, commandMsg);
}

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

export {
    initializePort,
    requestSysStatus,
    requestParameters,
    sendMavlinkCommand,
    online,
    statusRequested,
    logs
};
