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
let guidedModeSet = false;
let logs: string[] = [];
let newLogs: string[] = [];

const RECONNECT_INTERVAL = 5000; // 5 seconds

async function initializePort(): Promise<void> {
    if (port) {
        console.log("Port already initialized. Closing existing connection.");
        await closeConnection();
    }

    try {
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

        setupReaderAndListeners();
        console.log("Connection established successfully.");
    } catch (error) {
        console.error("Failed to initialize port:", error);
        scheduleReconnect();
    }
}

function setupReaderAndListeners() {
    if (!port) return;

    reader = port
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    reader.on('data', handlePacket);

    port.on('close', handleDisconnect);
    port.on('error', handleError);
}

function handlePacket(packet: MavLinkPacket) {
    online = true;
    const clazz = REGISTRY[packet.header.msgid];
    if (clazz) {
        const data = packet.protocol.data(packet.payload, clazz);
        const sanitizedData = convertBigIntToNumber(data);
        let timestamp = new Date().toISOString();
        let logEntry = `${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(sanitizedData as ParamValueData)}`;
        logs.push(logEntry);
        newLogs.push(logEntry);
        if (logEntry.includes('COMMAND_ACK')) console.log(logEntry);
    }
}

function handleDisconnect() {
    console.log("Connection closed. Attempting to reconnect...");
    online = false;
    scheduleReconnect();
}

function handleError(error: Error) {
    console.error("Connection error:", error);
    online = false;
    scheduleReconnect();
}

async function closeConnection(): Promise<void> {
    if (port) {
        port.removeAllListeners();
        if (port instanceof SerialPort) {
            await new Promise<void>((resolve) => port!.close(() => resolve()));
        } else {
            port.destroy();
        }
    }
    if (reader) {
        reader.removeAllListeners();
    }
    port = null;
    reader = null;
}

function scheduleReconnect() {
    setTimeout(() => {
        console.log("Attempting to reconnect...");
        initializePort();
    }, RECONNECT_INTERVAL);
}

async function requestSysStatus() {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    let request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GlobalPositionInt.MSG_ID;
    request.interval = 1000000; // 1 Hz (every 1 second)
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.MissionCurrent.MSG_ID;
    request.interval = 1000000; // 1 Hz (every 1 second)
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.SysStatus.MSG_ID;
    request.interval = 1000000; // 1 Hz (every 1 second)
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

async function sendSetModeCommand(mode: string) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const commandMsg = new common.DoSetModeCommand();
    commandMsg.targetSystem = 1;
    commandMsg.targetComponent = 0;
    commandMsg.mode = common.MavMode[mode as keyof typeof common.MavMode];
    await send(port, commandMsg);
}

async function sendMavlinkCommand(command: string, params: number[], useArduPilotMega = false) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const commandMsg = new common.CommandLong();
    commandMsg.targetSystem = 1;
    commandMsg.targetComponent = 0;
    if (useArduPilotMega) {
        commandMsg.command = parseInt(`${ardupilotmega.MavCmd[command as keyof typeof ardupilotmega.MavCmd]}`);
    } else {
        commandMsg.command = common.MavCmd[command as keyof typeof common.MavCmd];
    }
    if (params[0]) commandMsg._param1 = params[0];
    if (params[1]) commandMsg._param2 = params[1];
    if (params[2]) commandMsg._param3 = params[2];
    if (params[3]) commandMsg._param4 = params[3];
    if (params[4]) commandMsg._param5 = params[4];
    if (params[5]) commandMsg._param6 = params[5];
    if (params[6]) commandMsg._param7 = params[6];
    await send(port, commandMsg);
}

async function sendManualControl(x: number, y: number, z: number, r: number, buttons: number, mode: number) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const msg = new common.ManualControl();
    msg.target = 1;
    msg.x = x;
    msg.y = y;
    msg.z = z;
    msg.r = r;
    msg.buttons = buttons;
    await send(port, msg);
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
    sendManualControl,
    sendSetModeCommand,
    online,
    statusRequested,
    logs,
    newLogs,
    common
};
