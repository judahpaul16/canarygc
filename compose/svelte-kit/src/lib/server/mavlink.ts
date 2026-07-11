import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import {
    MavLinkPacketSplitter,
    MavLinkPacketParser,
    common,
    ardupilotmega,
    send
} from 'node-mavlink';

import { building } from '$app/environment';
import { REGISTRY } from '$lib/mavlink-registry'

// Treat the link as down when no packet has arrived within this window, even if
// the socket never fires 'close' (a silent stall), so the next heartbeat can
// re-establish it.
const STALE_LINK_MS = 4000;
// ArduPilot holds its boot on serial0's tcp:wait until a client connects and
// can take tens of seconds after an EEPROM wipe before the first bytes flow, so
// the connect wait is generous. A short timeout churns connect/destroy cycles
// that keep stealing the autopilot's single TCP slot mid-boot.
const CONNECT_TIMEOUT_MS = 60_000;
// Telemetry logs are capped so a long-running station cannot grow them without
// bound; the cap covers several minutes of backlog for the event-log view.
const MAX_LOG_ENTRIES = 5000;

const SUPERVISOR_INTERVAL_MS = 2000;

interface MavlinkState {
    port: SerialPort | Socket | null;
    reader: MavLinkPacketParser | null;
    online: boolean;
    lastPacketAt: number;
    connectPromise: Promise<void> | null;
    logs: string[];
    newLogs: string[];
    supervisor: ReturnType<typeof setInterval> | null;
    lastErrorMessage: string;
}

// The link state lives on globalThis so a dev-server module reload reuses the
// open connection. Module-local state orphans the previous socket on every
// reload, and an orphan holds SITL's single serial-over-TCP slot, leaving every
// later connection byte-less until timeout.
const g = globalThis as typeof globalThis & { __canarygcMavlink?: MavlinkState };
const state: MavlinkState = (g.__canarygcMavlink ??= {
    port: null,
    reader: null,
    online: false,
    lastPacketAt: 0,
    connectPromise: null,
    logs: [],
    newLogs: [],
    supervisor: null,
    lastErrorMessage: ''
});

// The server owns the autopilot link and keeps it alive on its own; browser
// heartbeats read the state this loop maintains rather than driving dialing.
// This also guarantees the first client an autopilot sees after boot is one
// stable connection, since SITL binds serial0 to its first client. Prerendering
// during the build loads this module too, so the loop stays off there.
if (!building && !state.supervisor) {
    state.supervisor = setInterval(() => {
        if (!linkAlive()) initializePort().catch(() => {});
    }, SUPERVISOR_INTERVAL_MS);
}

const logs = state.logs;
const newLogs = state.newLogs;

function pushLog(entry: string): void {
    logs.push(entry);
    newLogs.push(entry);
    if (logs.length > MAX_LOG_ENTRIES) logs.splice(0, logs.length - MAX_LOG_ENTRIES);
    if (newLogs.length > MAX_LOG_ENTRIES) newLogs.splice(0, newLogs.length - MAX_LOG_ENTRIES);
}

function linkAlive(): boolean {
    return Boolean(
        state.port && state.reader && state.lastPacketAt > 0 && Date.now() - state.lastPacketAt < STALE_LINK_MS
    );
}

// Concurrent heartbeats share one connect attempt instead of dialing over each
// other while the previous attempt is still waiting for its first packet.
function initializePort(): Promise<void> {
    state.connectPromise ??= doInitialize().finally(() => {
        state.connectPromise = null;
    });
    return state.connectPromise;
}

async function doInitialize(): Promise<void> {
    try {
        teardownConnection();
        openConnection();
        setupPacketReader();
        setupPortListeners();
        await waitForFirstPacket();
        state.lastErrorMessage = '';
        pushLog('MAVLink connection initialized');
    } catch (error) {
        // A half-open socket left behind would hold the autopilot's single TCP
        // slot and starve every later attempt.
        teardownConnection();
        const message = (error as Error).message;
        if (message !== state.lastErrorMessage) {
            state.lastErrorMessage = message;
            console.error('Failed to initialize port:', message);
        }
        throw error;
    }
}

function teardownConnection(): void {
    state.reader?.removeAllListeners();
    state.reader = null;
    if (state.port) {
        state.port.removeAllListeners();
        state.port.destroy();
        state.port = null;
    }
    state.online = false;
    state.lastPacketAt = 0;
}

function openConnection(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction === true) {
        // Use UART serial port in production
        state.port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200, lock: false });
    } else {
        // Use TCP socket in development
        const socket = connect({ host: 'sitl', port: 5760 });
        socket.setKeepAlive(true, 1000);
        socket.setNoDelay(true);
        state.port = socket;
    }
}

function setupPacketReader(): void {
    state.reader = state.port!
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    state.reader.on('data', (packet) => {
        state.online = true;
        state.lastPacketAt = Date.now();
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
    state.port!.on('close', handlePortClose);
    // A stream 'error' with no listener would crash the process; handle it so a
    // mid-flight read error drops the link cleanly instead.
    state.port!.on('error', handlePortError);
}

function handlePortClose(): void {
    state.port = null;
    state.reader = null;
    state.online = false;
    pushLog('MAVLink connection closed');
}

function handlePortError(err: Error): void {
    state.online = false;
    pushLog(`MAVLink connection error: ${err.message}`);
}

function waitForFirstPacket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timeout);
            state.reader?.off('data', onData);
            state.port?.off('error', onError);
        };
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for MAVLink data'));
        }, CONNECT_TIMEOUT_MS);
        const onData = () => {
            cleanup();
            resolve();
        };
        const onError = (err: Error) => {
            cleanup();
            reject(new Error(`Error connecting to the MAVLink server: ${err.message}`));
        };
        state.reader!.once('data', onData);
        (state.port as Socket).once('error', onError);
    });
}

async function requestStatus() {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    let request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GlobalPositionInt.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GpsRawInt.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.MissionCurrent.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.BatteryStatus.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);
}

async function requestParameters() {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const request = new common.ParamRequestList();
    request.targetSystem = 1;
    request.targetComponent = 1;
    await send(state.port, request);
}

async function writeParameter(id: string, value: number, type: number) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const request = new common.ParamSet();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.paramId = id;
    request.paramValue = value;
    request.paramType = type;
    await send(state.port, request);
}

async function sendMavlinkCommand(command: string, params: number[], useCmdLong = false, useArduPilotMega = false) {
    if (!state.port || !state.reader) {
        state.online = false;
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
    await send(state.port, commandMsg);
}

async function setMissionCount(numItems: number) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const count = new common.MissionCount();
    count.targetSystem = 1;
    count.targetComponent = 1;
    count.count = numItems;
    count.opaqueId = 0;
    await send(state.port, count);
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
    if (!state.port || !state.reader) {
        state.online = false;
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
    await send(state.port, msg);
}

async function clearAllMissionItems() {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const msg = new common.MissionClearAll();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    await send(state.port, msg);
}

async function setPositionLocal(x: number, y: number, z: number) {
    if (!state.port || !state.reader) {
        state.online = false;
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
    await send(state.port, msg);
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
    logs,
    newLogs,
};
