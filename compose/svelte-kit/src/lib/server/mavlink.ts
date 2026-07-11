import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import {
    MavLinkPacketSplitter,
    MavLinkPacketParser,
    common,
    ardupilotmega,
    send
} from 'node-mavlink';

import { REGISTRY } from '$lib/mavlink-registry'

let port: SerialPort | Socket | null = null;
let reader: MavLinkPacketParser | null = null;
let online = false;
const logs: string[] = [];
const newLogs: string[] = [];
let connecting = false;
let lastPacketAt = 0;

// Treat the link as down when no packet has arrived within this window, even if
// the socket never fires 'close' (a silent stall), so the next heartbeat can
// re-establish it.
const STALE_LINK_MS = 4000;
const CONNECT_TIMEOUT_MS = 5000;
// Telemetry logs are capped so a long-running station cannot grow them without
// bound; the cap covers several minutes of backlog for the event-log view.
const MAX_LOG_ENTRIES = 5000;

function pushLog(entry: string): void {
    logs.push(entry);
    newLogs.push(entry);
    if (logs.length > MAX_LOG_ENTRIES) logs.splice(0, logs.length - MAX_LOG_ENTRIES);
    if (newLogs.length > MAX_LOG_ENTRIES) newLogs.splice(0, newLogs.length - MAX_LOG_ENTRIES);
}

function linkAlive(): boolean {
    return Boolean(port && reader && lastPacketAt > 0 && Date.now() - lastPacketAt < STALE_LINK_MS);
}

async function initializePort(): Promise<void> {
    if (connecting) return;
    connecting = true;
    try {
        await closeExistingConnection();
        await openNewConnection();
        setupPacketReader();
        setupPortListeners();
    } catch (error) {
        console.error('Failed to initialize port:', error);
        throw error;
    } finally {
        connecting = false;
    }
}

async function closeExistingConnection(): Promise<void> {
    if (port !== null) {
        port.removeAllListeners();
        await new Promise<void>((resolve, reject) => {
            try {
                port!.destroy(null as unknown as Error);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
        reader?.removeAllListeners();
        reader = null;
    }
}

async function openNewConnection(): Promise<void> {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction === true) {
        // Use UART serial port in production
        port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200, lock: false });
    } else {
        // Use TCP socket in development
        const socket = connect({ host: 'sitl', port: 5760 });
        socket.setKeepAlive(true, 1000);
        socket.setNoDelay(true);
        port = socket;
    }
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for MAVLink data'));
        }, CONNECT_TIMEOUT_MS);
        port!.once('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error connecting to the MAVLink server: ${err.message}`));
        });
        port!.once('data', () => {
            clearTimeout(timeout);
            lastPacketAt = Date.now();
            pushLog('MAVLink connection initialized');
            resolve();
        });
    });
}

function setupPacketReader(): void {
    reader = port!
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    reader.on('data', (packet) => {
        online = true;
        lastPacketAt = Date.now();
        const clazz = REGISTRY[packet.header.msgid];
        if (clazz) {
            const data = packet.protocol.data(packet.payload, clazz);
            const sanitizedData = convertBigIntToNumber(data);
            const timestamp = new Date().toISOString();
            const logEntry = `${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(sanitizedData)}`;
            pushLog(logEntry);
            if (logEntry.includes('_ACK') && !logEntry.includes('"command":512')) console.log(logEntry);
        }
    });
}

function setupPortListeners(): void {
    port!.on('close', handlePortClose);
    // A stream 'error' with no listener would crash the process; handle it so a
    // mid-flight read error drops the link cleanly instead.
    port!.on('error', handlePortError);
}

function handlePortClose(): void {
    port = null;
    reader = null;
    online = false;
    pushLog('MAVLink connection closed');
}

function handlePortError(err: Error): void {
    online = false;
    pushLog(`MAVLink connection error: ${err.message}`);
}

async function requestStatus() {
    if (!port || !reader) {
        online = false;
        return;
    }

    let request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GlobalPositionInt.MSG_ID;
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GpsRawInt.MSG_ID;
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.RequestMessageCommand();;
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.MissionCurrent.MSG_ID;
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.BatteryStatus.MSG_ID;
    request.responseTarget = 1;
    await send(port!, request);
}

async function requestParameters() {
    if (!port || !reader) {
        online = false;
        return;
    }

    const request = new common.ParamRequestList();
    request.targetSystem = 1;
    request.targetComponent = 1;
    await send(port!, request);
}

async function writeParameter(id: string, value: number, type: number) {
    if (!port || !reader) {
        online = false;
        return;
    }

    const request = new common.ParamSet();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.paramId = id;
    request.paramValue = value;
    request.paramType = type;
    await send(port!, request);
}

async function sendMavlinkCommand(command: string, params: number[], useCmdLong = false, useArduPilotMega = false) {
    if (!port || !reader) {
        online = false;
        return;
    }

    let commandMsg: common.CommandInt | common.CommandLong;
    if (useCmdLong) commandMsg = new common.CommandLong();
    else {
        commandMsg = new common.CommandInt();
        commandMsg.frame = 0; // MAV_FRAME_GLOBAL;
    };
    
    commandMsg.targetSystem = 1;
    commandMsg.targetComponent = 1;

    if (useArduPilotMega) commandMsg.command = parseInt(`${ardupilotmega.MavCmd[command as keyof typeof ardupilotmega.MavCmd]}`);
    else commandMsg.command = common.MavCmd[command as keyof typeof common.MavCmd];

    if (params[0]) commandMsg._param1 = params[0];
    if (params[1]) commandMsg._param2 = params[1];
    if (params[2]) commandMsg._param3 = params[2];
    if (params[3]) commandMsg._param4 = params[3];
    if (params[4]) commandMsg._param5 = params[4];
    if (params[5]) commandMsg._param6 = params[5];
    if (params[6]) commandMsg._param7 = params[6];
    await send(port!, commandMsg);
}

async function setMissionCount(numItems: number) {
    if (!port || !reader) {
        online = false;
        return;
    }

    const count = new common.MissionCount();
    count.targetSystem = 1;
    count.targetComponent = 1;
    count.count = numItems;
    count.opaqueId = 0;
    await send(port!, count);
    await new Promise((resolve) => setTimeout(resolve, 250)); // Wait for 250 ms
}

export interface MissionItemInput {
    command: number;
    frame: number;
    lat: number;
    lon: number;
    alt: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
}

async function loadMissionItem(item: MissionItemInput, index: number) {
    if (!port || !reader) {
        online = false;
        return;
    }

    const msg = new common.MissionItemInt();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.seq = index;
    msg.frame = item.frame;
    msg.command = item.command;
    msg.current = index === 0 ? 1 : 0;
    msg.autocontinue = 1;
    msg.param1 = item.param1;
    msg.param2 = item.param2;
    msg.param3 = item.param3;
    msg.param4 = item.param4;
    msg.x = Number((item.lat * 1e7).toFixed(0));
    msg.y = Number((item.lon * 1e7).toFixed(0));
    msg.z = item.alt;
    msg.missionType = 0;
    await send(port!, msg);
}

async function clearAllMissionItems() {
    if (!port || !reader) {
        online = false;
        return;
    }

    const msg = new common.MissionClearAll();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    await send(port!, msg);
}

async function setPositionLocal(x: number, y: number, z: number) {
    if (!port || !reader) {
        online = false;
        return;
    }
    const msg = new common.SetPositionTargetLocalNed();
    
    msg.timeBootMs = 0;
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.coordinateFrame = 1; // MAV_FRAME_LOCAL_NED
    // @ts-expect-error typeMask is declared readonly upstream but must be set per message
    msg.typeMask = 0b011111111000; // ignore all but position
    msg.x = x;
    msg.y = y;
    msg.z = z;
    msg.yawRate = 0;
    await send(port!, msg);
  }

function convertBigIntToNumber(obj: unknown): unknown {
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
    requestStatus,
    requestParameters,
    writeParameter,
    sendMavlinkCommand,
    setMissionCount,
    loadMissionItem,
    clearAllMissionItems,
    setPositionLocal,
    linkAlive,
    port,
    reader,
    online,
    connecting,
    logs,
    newLogs,
    common,
};
